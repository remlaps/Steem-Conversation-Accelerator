/***
 * Code structure:
 *    - global information
 *    - Event listeners
 *    - Main logic
 *    - Helper functions
 *    - Alarm related functions
 */

/*
 *  Import additional functions for accessing, locking, and mamipulating local storage.
 */
importScripts('localStorageUtils.js');
let isCheckingActivity = false;
saveIsCheckingActivity(isCheckingActivity);  // This is defined in "localStorageUtils.js"

/*
 * Other global variables / functions using the arrrow operator.
 */
let accountsWithNewActivity = [];
let savedAccountList = [];
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

if (typeof browser === "undefined") {
    // This is an attempt to provide Firefox compatibility, suggested by Claude.ai.
    var browser = chrome;
}

/***
 * Event listeners
 */

/*
 * Run at installation and/or reload time.
 */
chrome.runtime.onInstalled.addListener( async function (details) {
    let pluginStartTime = new Date().toISOString();
    if (details.reason === 'install') {
        /*
         * At installation time, clear storage and display a popup window to collect required fields.
         */
        chrome.storage.sync.clear();
        chrome.storage.local.clear();
        chrome.windows.create({
            url: chrome.runtime.getURL('popup.html'),
            type: 'popup',
            width: 600,
            height: 800
        });
        console.log(`plugin installed at ${pluginStartTime}`);
    } else if (details.reason === 'update') {
        console.log(`plugin updated at ${pluginStartTime}`);
    }

    try {
        const result = await chrome.storage.local.get(['steemObserverName']);
        const steemObserverName = result.steemObserverName;
        if (steemObserverName) {
            await saveIsCheckingActivity(false);  // Reset to false in case of reinstall while running.
            // await checkForNewActivitySinceLastNotification(steemObserverName);
            setupAlarms();
        } else {
            console.log('Steem username not set for SCA. Please set it in the extension settings.');
        }
    } catch (error) {
        console.error('Error loading storage:', error);
    }

    showAlarms();
});

/*
 * Run these instructions when browser storage changes.
 */
chrome.storage.onChanged.addListener((changes, area) => {
    // Reset if changes were observed with the stored username or polling intervals.
    if (area === 'local' && ('steemObserverName' in changes || 'pollingTime' in changes)) {
        // console.log('Changes observed:', JSON.stringify(changes, null, 2));
        clearAlarms();
        setupAlarms();
        showAlarms();
    }
});

/*
 * Disable alarms if the browser goes idle for 10 minutes.  Reenable when activity resumes.
 */
chrome.idle.onStateChanged.addListener((state) => {
    if (state === 'idle') {
        // Browser went idle.  Set an idle timeout.
        chrome.alarms.create('idleTimeoutAlarm', { delayInMinutes: 10 });
        console.log('Idle timeout alarm set.');
    } else if (state === 'active') {
        // Browser became active, clear the idle timeout.
        chrome.alarms.get('idleTimeoutAlarm', (alarm) => {
            if (alarm) {
                chrome.alarms.clear('idleTimeoutAlarm');
                console.log('Idle timeout alarm cleared.');
            } else {
                console.log('No idle timeout alarm to clear.');
            }

            // Restart checkSteemActivity if not already active
            setupAlarms();
            showAlarms();
        });
    }
});

/*
 * When a "checkSteemActivity" alarm is received,
 *    - get the observer account from browser storage
 *    - check the observer's followers for post/comment/reply activity.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkSteemActivity') {
        // console.log("Alarm recieved.");
        chrome.storage.local.get(['steemObserverName'], async (result) => {
            const steemObserverName = result.steemObserverName;
            if (steemObserverName) {
                await checkForNewActivitySinceLastNotification(steemObserverName);
            } else {
                console.debug('Alarm triggered, but the Steem username is not set in SCA.');
                console.debug('Please set it in the extension settings.');
            }
        });
        // console.log("Ending alarm processing.");
    } else if ( alarm.name === 'idleTimeoutAlarm') {
        clearAlarms();
    }
});


// Handle notification click
chrome.notifications.onClicked.addListener(() => {
    // Open activityList.html with accountsWithNewActivity data
    chrome.tabs.create({url: chrome.runtime.getURL('activityList.html')});  // Open in tab

//    chrome.windows.create({                                                   // Open in new window
//        url: chrome.runtime.getURL('activityList.html'),
//        type: 'popup',
//        width: 600,
//        height: 800
//    });
    savedAccountList = [];
});

chrome.runtime.onStartup.addListener(() => {
    setupAlarms();
});


/***
 * Main polling logic
 */
async function checkForNewActivitySinceLastNotification(steemObserverName) {
    let isCheckingActivity = await getIsCheckingActivity();
    if (isCheckingActivity) {
        return;
    }
    isCheckingActivity = true;
    await saveIsCheckingActivity(isCheckingActivity);

    if (await acquireLock('background', 1)) { // Lower priority
        // console.log(`array lock set in checkForNewActivitySinceLastNotification ${steemObserverName}.`);
        try {
            const { currentCheckTime, fifteenMinutesAgo } = await updateCheckTimes();  // clock times as ISO Strings
            let {
                accountsWithNewActivity,
                lastCheckedIndex,
                checkStartTime
            } = await retrieveAndInitializeProgress(fifteenMinutesAgo);

            /*
             * get accountsWithNewActivity from storage or set it up with an empty list and 0 length.
             */
            accountsWithNewActivity = JSON.parse(accountsWithNewActivity || '[]');
            lastCheckedIndex = lastCheckedIndex || 0;
            // console.log(`Beginning or resuming check from index ${lastCheckedIndex}`);

            // Get the observer account and collect its followed accounts.
            steemObserverName = await getStoredUser();
            apiNode = await getApiServerName();
            const followingList = await getFollowingListWithRetry(steemObserverName, apiNode);

            // Delete unfollowed accounts or not-followed accounts after switching observer accounts in the pop-up window.
            accountsWithNewActivity = await deleteNoFollows(followingList, accountsWithNewActivity);
            let newActivityFound = false;

            // Check every followed account
            for (let i = lastCheckedIndex; i < followingList.length; i++) {
                if (!(await updateLock('background'))) {  // Check for activityList.js lock
                    // activityList.js grabbed the lock.  Reset to start over.
                    isCheckingActivity = false;
                    await saveIsCheckingActivity(isCheckingActivity);
                    await chrome.storage.local.set({
                        lastCheckedIndex: 0,
                    });
                    newActivityFound = false;
                    break;
                }
                const followedAccount = followingList[i];
                try {
                    let searchMin = new Date(`${checkStartTime}`);          // Default in case there is no history for this account.
                    searchMin = new Date(searchMin.getTime() - 15 * 60 * 1000);    // Back up 15 minutes in case of API lag.
                                                                                
                    let existingAccountIndex = accountsWithNewActivity.findIndex(item => item.account === followedAccount);
                    if (existingAccountIndex !== -1) {
                        // Update existing accounts with their lastDisplayTime values.
                        searchMin = new Date(accountsWithNewActivity[existingAccountIndex].lastDisplayTime);
                    }

                    // Get the most recent post/comment/reply activity
                    const lastAccountActivityObserved = await getActivityTimeWithRetry(followedAccount, apiNode, searchMin);
                    if (lastAccountActivityObserved === null) {
                        console.warn(`Failed to fetch activity time for ${followedAccount}. Skipping.`);
                        continue;
                    }

                    const newActivity = updateAccountActivity(followedAccount, searchMin, lastAccountActivityObserved, accountsWithNewActivity);
                    if ( newActivity ) {
                        newActivityFound = true;
                    } else {
                        // accountsWithNewActivity = deleteTriplet(accountsWithNewActivity, followedAccount);
                    }

                    const shouldContinue = await saveProgressEveryTenAccounts(i, followedAccount, searchMin, lastAccountActivityObserved, accountsWithNewActivity);
                    if (!shouldContinue) {
                        return;
                    }

                    // Add a small delay to avoid overwhelming APIs with low rate limits.
                    await new Promise(resolve => setTimeout(resolve, 150));

                } catch (error) {
                    console.error(`Error checking activity for ${followedAccount}:`, error);
                    continue;
                }
            }

            console.log("Done checking activity times.");
            console.log(`newActivityFound: ${newActivityFound}`);
            console.log(`accountsWithNewActivity: ${JSON.stringify(accountsWithNewActivity)}`);

            if (newActivityFound) {
                await handleNewActivity(accountsWithNewActivity, currentCheckTime);
            } else {
                console.log("No new activity found, skipping notification.");
            }

            // Update lastAlertTime
            await chrome.storage.local.set({
                'lastAlertTime': new Date().toISOString(),
                'lastCheckedIndex': 0
            });

        } catch (error) {
            console.error('Error checking for new activity since last alert:', error);
        } // finally {
        await releaseLock();
        console.log(`array lock cleared in checkForNewActivitySinceLastNotification ${steemObserverName}.`);
        // }
    } else {
        console.debug('Could not acquire lock in background.js, will try again later');
    }
    isCheckingActivity = false;
    await saveIsCheckingActivity(isCheckingActivity);
}

/***
 * Helper functions
 */

/*
 * Delete an account from the list of {account, lastActivityTime, lastDisplayTime} triplets.
 */
function deleteTriplet(accountTriplets, accountToDelete) {
    return accountTriplets.filter(item => item.account !== accountToDelete);
}

function countNewActivities(accountsWithNewActivity) {
    let count = 0;

    for (let i = 0; i < accountsWithNewActivity.length; i++) {
        const activity = accountsWithNewActivity[i];
        const activityTime = new Date(activity.activityTime);
        const lastDisplayTime = new Date(activity.lastDisplayTime);

        if (activityTime > lastDisplayTime) {
            count++;
        }
    }

    return count;
}

async function getActivityTimeWithRetry(followedAccount, apiNode, startTime, retries = 10) {
    for (let i = 0; i < retries; i++) {
        try {
            const lastAccountActivityObserved = await getActivityTime(followedAccount, apiNode, startTime);
            if (lastAccountActivityObserved !== null) {
                return lastAccountActivityObserved;
            }
        } catch (error) {
            console.warn(`Error in getActivityTimeWithRetry for ${followedAccount}:`, error);
        }
        
        const waitTime = Math.min(1000 * Math.pow(2, i), 4000); // Exponential backoff, max 30 seconds
        console.warn(`Failed to get activity time for ${followedAccount}. Retrying in ${waitTime/1000} seconds... (${retries - i - 1} retries left)`);
        await delay(waitTime);
    }
    
    console.warn(`Failed to get activity time for ${followedAccount} after maximum retries.`);
    return null;
}

async function retrieveAndInitializeProgress(fifteenMinutesAgo) {
    // Retrieve stored progress
    let {lastAlertTime, lastBackgroundPollTime, lastActivityPageViewTime, accountsWithNewActivity, lastCheckedIndex} =
            await chrome.storage.local.get(['lastAlertTime', 'lastBackgroundPollTime', 'lastActivityPageViewTime',
                'accountsWithNewActivity', 'lastCheckedIndex']);
    
    // Initialize times for polling to fifteen minutes ago, in case they're empty (i.e. first time through)
    // lastAlertTime = lastAlertTime || fifteenMinutesAgo;
    // lastBackgroundPollTime = lastBackgroundPollTime || fifteenMinutesAgo;
    if (!lastActivityPageViewTime) {
        lastActivityPageViewTime = fifteenMinutesAgo;
        await chrome.storage.local.set({'lastActivityPageViewTime': lastActivityPageViewTime});
    } 
    const checkStartTime = lastActivityPageViewTime;  // last display of the activity list, or fifteen minutes ago.

    return {
        accountsWithNewActivity,
        lastCheckedIndex,
        checkStartTime
    };
    /*
     * Seems like lastAlertTime, lastBackgroundPollTime, and lastActivityPageView time don't need to be returned...
     *    Not sure if lastAlertTime and lastBackgroundPollTime are needed at all.  Possibly not.
     *    lastActivityPageViewTime is used to collect data from activityList.js.
     */
}

async function updateCheckTimes() {
    /*
     * Set times to 15 minutes ago if this hasn't been running, or if local storage got somehow lost.
     */
    const now = new Date();
    const currentCheckTime = now.toISOString();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    
    await chrome.storage.local.set({ 'lastBackgroundPollTime': currentCheckTime });

    return { currentCheckTime, fifteenMinutesAgo };
}

async function handleNewActivity(accountsWithNewActivity, currentCheckTime) {
    const newActivityCount = countNewActivities(accountsWithNewActivity);
    console.log(`Number of accounts with new activity: ${newActivityCount}`);
    const notificationMessage = `${newActivityCount} of your followed accounts had posts, comments, or replies!`;
    await chrome.storage.local.set({
        accountsWithNewActivity: JSON.stringify(accountsWithNewActivity),
        currentCheckTime: currentCheckTime
    });
    try {
        await displayBrowserNotification(notificationMessage);
        // console.log("Browser notification displayed successfully.");
    } catch (error) {
        console.error("Error displaying browser notification:", error);
    }
}

// unused parameters are passed for debugging purposes.
async function saveProgressEveryTenAccounts(i, followedAccount, searchMin, lastAccountActivityObserved, accountsWithNewActivity) {
    if (i % 10 === 0) {
        if (!(await updateLock('background'))) {
            // console.log('Lost lock during processing in background.js');
            // reset to start over.
            isCheckingActivity = false;
            await saveIsCheckingActivity(isCheckingActivity);
            await chrome.storage.local.set({
                lastCheckedIndex: 0,
            });
            return false;
        }
        await chrome.storage.local.set({
            lastCheckedIndex: i,
            accountsWithNewActivity: JSON.stringify(accountsWithNewActivity)
        });
        // console.debug(`Processed ${followedAccount} after ${searchMin.toISOString()}. Last activity: ${lastAccountActivityObserved.toISOString()}.`);
    }
    return true;
}

function updateAccountActivity(followedAccount, searchMin, lastAccountActivityObserved, accountsWithNewActivity) {
    // console.debug(`Comparing ${searchMin.toISOString()} and ${lastAccountActivityObserved.toISOString()} for user ${followedAccount}.`);
    const existingAccountIndex = accountsWithNewActivity.findIndex(item => item.account === followedAccount);
    
    if (new Date(searchMin) < new Date(lastAccountActivityObserved)) {
        // Activity observed after last notification
        if (existingAccountIndex === -1) {
            addNewAccountActivity(followedAccount, lastAccountActivityObserved, accountsWithNewActivity);
        } else {
            updateExistingAccountActivity(existingAccountIndex, lastAccountActivityObserved, accountsWithNewActivity);
        }
        // console.debug("Saved account.");
        return true;
    } else {
        return false;
    }
}

function addNewAccountActivity(followedAccount, lastAccountActivityObserved, accountsWithNewActivity) {
    const oneSecondBefore = new Date(lastAccountActivityObserved.getTime() - 1000);
    const newActivity = {
        account: followedAccount,
        activityTime: lastAccountActivityObserved,
        lastDisplayTime: oneSecondBefore // .toISOString() // or whatever format you prefer
    };
    accountsWithNewActivity.push(newActivity);
}

function updateExistingAccountActivity(existingAccountIndex, lastAccountActivityObserved, accountsWithNewActivity) {
    const existingAccount = accountsWithNewActivity[existingAccountIndex];
    existingAccount.activityTime = lastAccountActivityObserved;
    accountsWithNewActivity[existingAccountIndex] = existingAccount;
    // lastDisplayTime remains unchanged
}

async function displayBrowserNotification(message) {
    // console.log("account list: ", accountsWithNewActivity, " in displayBrowserNotification.");

    // Clear all notifications created by this extension
    await chrome.notifications.getAll(function (notifications) {
        for (let notificationId in notifications) {
            if (notifications.hasOwnProperty(notificationId)) {
                chrome.notifications.clear(notificationId, function (wasCleared) {
                    if (wasCleared) {
                        // console.log(`Notification ${notificationId} cleared.`);
                    } else {
                        // console.log(`Notification ${notificationId} could not be cleared.`);
                    }
                });
            }
        }
    });

    // Create a new notification
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'SCAicon.png',
        title: 'Steem Activity Alert',
        message: message
    });
}

async function deleteNoFollows(followList, activityTriplets) {
    const newActivityTriplets = [];
    for (const triplet of activityTriplets) {
        if (followList.includes(triplet.account)) {
            newActivityTriplets.push(triplet);
        }
    }

    // Ensure accountsWithNewActivity is an array
    if (!Array.isArray(accountsWithNewActivity)) {
        accountsWithNewActivity = Object.values(accountsWithNewActivity); // Convert to array
    }

    return newActivityTriplets;
}

async function getFollowingList(steemObserverName, apiNode, limit = 100, maxRetries = 5) {
    let followingList = [];
    let start = null;

    // Retrieve stored progress
    const storedData = await chrome.storage.local.get(['lastFetchedUser', 'partialFollowingList']);
    if (storedData.lastFetchedUser && storedData.partialFollowingList) {
        start = storedData.lastFetchedUser;
        followingList = storedData.partialFollowingList;
    }

    try {
        do {
            let data;
            let retries = 0;
            while (retries < maxRetries) {
                try {
                    const response = await fetch(apiNode, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'condenser_api.get_following',
                            params: [steemObserverName, start, 'blog', limit],
                            id: 1
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    data = await response.json();
                    break; // If we get here, the request was successful
                } catch (error) {
                    if (retries === maxRetries - 1) {
                        throw error; // Rethrow if we've exhausted all retries
                    }
                    const waitTime = Math.min(1000 * Math.pow(2, retries), 4000);
                    console.warn(`Error fetching data. Retrying in ${waitTime/1000} seconds...`);
                    await async function getFollowingListWithRetry(steemObserverName, apiNode, limit = 100, maxRetries = 3) {
                        for (let i = 0; i < maxRetries; i++) {
                            try {
                                return await getFollowingList(steemObserverName, apiNode, limit);
                            } catch (error) {
                                if (i === maxRetries - 1) {
                                    console.error(`Failed to get following list for ${steemObserverName} after ${maxRetries} attempts.`);
                                    throw error;
                                }
                                const waitTime = Math.min(1000 * Math.pow(2, i), 4000);
                                console.warn(`Failed to get following list. Retrying in ${waitTime/1000} seconds...`);
                                await delay(waitTime);
                            }
                        }
                    }(waitTime);
                    retries++;
                }
            }

            if (data.error) {
                console.warn('Error fetching following list:', data.error.message);
                break;
            }

            if (data && data.result && Array.isArray(data.result)) {
                const users = data.result.map(user => user.following);
                followingList = followingList.concat(users);
                start = users.length === limit ? users[users.length - 1] : null;
                await chrome.storage.local.set({
                    lastFetchedUser: start,
                    partialFollowingList: followingList
                });
            } else {
                console.error('Unexpected API response structure:', data);
                break;
            }

            // Add a small delay between requests to avoid rate limiting
            await delay(100);
        } while (start);

        followingList = Array.from(new Set(followingList));
        return followingList;
    } catch (error) {
        console.error('Error fetching following list:', error);
        await chrome.storage.local.set({
            lastFetchedUser: start,
            partialFollowingList: followingList
        });
        throw error;
    }
}

async function getFollowingListWithRetry(steemObserverName, apiNode, limit = 100, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await getFollowingList(steemObserverName, apiNode, limit);
        } catch (error) {
            if (i === maxRetries - 1) {
                console.error(`Failed to get following list for ${steemObserverName} after ${maxRetries} attempts.`);
                throw error;
            }
            const waitTime = Math.min(1000 * Math.pow(2, i), 4000);
            console.warn(`Failed to get following list. Retrying in ${waitTime/1000} seconds...`);
            await delay(waitTime);
        }
    }
}

async function getActivityTime(user, apiNode, startTime) {
    try {
        let lastTransaction = -1;
        const chunkSize = 20;
        const maxChunks = 20; // This will check up to 400 transactions (20 * 20)
                              //    - If there are more than 400 transactions for the account after the most recent
                              //       post/comment/reply, it will be missed.  Voting trails may block some posts.

        for (let chunkIndex = 0; chunkIndex < maxChunks; chunkIndex++) {
            if ( lastTransaction > chunkSize ) {
                lastTransaction = chunkSize;
            }
            const postData = JSON.stringify({
                jsonrpc: '2.0',
                method: 'condenser_api.get_account_history',
                params: [user, lastTransaction, chunkSize],
                id: 1
            });

            const response = await fetch(apiNode, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: postData
            });

            if (!response.ok) { 
                console.warn(`Rate limit hit for ${user}. Waiting before retry.`);
                await delay(5000); // Wait for 5 seconds before retrying
                chunkIndex--; // Retry this chunk
                continue;
            }

            const data = await response.json();

            if (data.error) {
                if ( data.error !== "Assert Exception:args.start >= args.limit: start must be greater than limit") {
                    console.warn(`Data error for ${user}: ${data.error.message}`);
                    return null;
                } else {
                    lastTransaction = chunkSize;
                }
            }

            if (!data.result || data.result.length === 0) {
                return null;
            }

            // Iterate through the transactions in reverse order (most recent first)
            for (let i = data.result.length - 1; i >= 0; i--) {
                const [transId, transaction] = data.result[i];
                const {timestamp, op} = transaction;
                const [opType] = op;

                if (opType === 'comment') {
                    return new Date(`${timestamp}Z`);
                }

                if (new Date(startTime) > new Date(`${timestamp}Z`)) {
                    return new Date("1970-01-01T00:00:00Z");
                }

                lastTransaction = transId - 1;

            }

            // Add a small delay between chunks to avoid rate limiting
            await delay(100);
        }

        return new Date("1970-01-01T00:00:00Z");

    } catch (error) {
        console.warn(`Error for ${user}:`, error);
        return null;
    }
}

function newerDate(date1, date2) {
    return new Date(date1) > new Date(date2) ? date1 : date2;
}

async function initializeAlertTime() {
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const lastAlertTime = fifteenMinutesAgo.toISOString(); // Initialize with current UTC date and time if not previously set

    // Save in chrome.storage.local
    await chrome.storage.local.set({'lastAlertTime': lastAlertTime});

    // console.log("Done setting up alarms at initialization.");
}

/***
 * 
 * Alarm functions begin here.  These names are self-explanatory.
 *    - clearAlarms()
 *    - setupAlarms()
 *    - showAlarms()
 */
function clearAlarms() {
    chrome.alarms.clear('checkSteemActivity', wasCleared => {
        if (wasCleared) {
            console.log('Alarm "checkSteemActivity" cleared successfully.');
        } else {
            console.log('Alarm "checkSteemActivity" not found or could not be cleared.');
        }
    });
}

// Set the alarms (when the extension loads or activates, or after the last poll finishes)
function setupAlarms() {
    chrome.storage.local.get(['pollingTime'], (result) => {
        let pollingTime = result.pollingTime || 7; // default to 7 if pollingTime is not set

        chrome.alarms.get('checkSteemActivity', (existingAlarm) => {
            if (!existingAlarm) {
                chrome.alarms.create('checkSteemActivity', {periodInMinutes: pollingTime});
                console.log(`A 'checkSteemActivity' alarm has been set with polling time: ${pollingTime}`);
            }
        });
    });
}

function showAlarms() {
    // Get all scheduled alarms
    chrome.alarms.getAll(alarms => {
        if (alarms.length === 0) {
            console.log('No alarms currently scheduled.');
        } else {
            // console.log('Currently scheduled alarms:');
            alarms.forEach(alarm => {
                const gmtTime = new Date(alarm.scheduledTime).toISOString();
                console.log(`- Alarm "${alarm.name}" at ${new Date(alarm.scheduledTime)}`);
            });
        }
    });
}
