/* global chrome, steem */

/*
 *  Import additional scripts for accessing, locking, and mamipulating local storage.
 */
importScripts('localStorageUtils.js');
let isCheckingActivity = false;
saveIsCheckingActivity(isCheckingActivity);  // This is defined in "localStorageUtils.js"

let accountsWithNewActivity = [];
let savedAccountList = [];

if (typeof browser === "undefined") {
    var browser = chrome;
}

/*
 * Run these instructions at installation and reload time.
 */
chrome.runtime.onInstalled.addListener(function (details) {
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
    chrome.storage.local.get(['steemObserverName'], async (result) => {
        const steemObserverName = result.steemObserverName;
        if (steemObserverName) {
            // Reinitialize.  This should probably only happen when the plugin was reloaded.  Not when it was installed.
            await saveIsCheckingActivity(false);
            await checkForNewActivitySinceLastNotification(steemObserverName);
            setupAlarms();
        } else {
            console.log('Steem username not set for SCA. Please set it in the extension settings.');
        }
    });
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
 * Disable alarms if the browser goes idle.  Reenable when activity resumes.
 */
chrome.idle.onStateChanged.addListener(state => {
    if (state === 'idle') {
        // console.log("Browser is idle.  Disabling the alarms.");
        clearAlarms();
    } else if (state === 'active') {
        // console.log("Browser is active.  Setting the alarms.");
        setupAlarms();
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
            // } else {
                // console.log('Alarm triggered, but the Steem username is not set in SCA.');
                // console.log('Please set it in the extension settings.');
            }
        });
        // console.log("Ending alarm processing.");
    }
});


/***
 * 
 * Alarm methods begin here.  These names are self-explanatory.
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
                // console.log(`A 'checkSteemActivity' alarm has been set with polling time: ${pollingTime}`);
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

/*
 * Delete an account from the list of {account, lastActivityTime, lastDisplayTime} triplets.
 */
function deleteTriplet(accountTriplets, accountToDelete) {
    return accountTriplets.filter(item => item.account !== accountToDelete);
}

async function getActivityTimeWithRetry(followedAccount, apiNode, startTime, retries = 5) {
    try {
        const lastAccountActivityObserved = await getActivityTime(followedAccount, apiNode, startTime);
        if (lastAccountActivityObserved !== null) {
            return lastAccountActivityObserved;
        } else {
            console.warn(`Failed to get activity time for ${followedAccount}. Retrying in 1 second... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            if (retries > 0) {
                return getActivityTimeWithRetry(followedAccount, apiNode, startTime, retries - 1);
            } else {
                console.error(`Failed to get activity time for ${followedAccount} after maximum retries.`);
                return null;
            }
        }
    } catch (error) {
        console.error(`Error in getActivityTimeWithRetry for ${followedAccount}:`, error);
        if (retries > 0) {
            console.warn(`Retrying getActivityTimeWithRetry for ${followedAccount} in 1 second... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            return getActivityTimeWithRetry(followedAccount, apiNode, startTime, retries - 1);
        } else {
            console.error(`Failed to get activity time for ${followedAccount} after maximum retries due to error.`);
            return null;
        }
}
}

async function getFollowingListWithRetry(steemObserverName, apiNode, retries = 5) {
    while (retries > 0) {
        try {
            const followingList = await getFollowingList(steemObserverName, apiNode);
            // Clear the stored progress after successful completion
            await chrome.storage.local.remove(['lastFetchedUser', 'partialFollowingList']);
            return followingList;
        } catch (error) {
            retries--;
            console.warn(`Failed to get following list for ${steemObserverName}. Retrying in 1 second.`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    console.error(`Retry limit exceeded. Failed to get following list. Skipping ${steemObserverName}...`);
    return [];
}

async function checkForNewActivitySinceLastNotification(steemObserverName) {
    let isCheckingActivity = await getIsCheckingActivity();
    if (isCheckingActivity) {
        // console.log('checkForNewActivitySinceLastNotification is already running.');
        return;
    }
    isCheckingActivity = true;
    await saveIsCheckingActivity(isCheckingActivity);
    if (await acquireLock('background', 1)) { // Lower priority
        // console.log(`array lock set in checkForNewActivitySinceLastNotification ${steemObserverName}.`);
        try {


            // Retrieve stored progress
            let {lastAlertTime, lastBackgroundPollTime, lastActivityPageViewTime, accountsWithNewActivity, lastCheckedIndex} =
                    await chrome.storage.local.get(['lastAlertTime', 'lastBackgroundPollTime', 'lastActivityPageViewTime',
                        'accountsWithNewActivity', 'lastCheckedIndex']);

            const currentCheckTime = new Date().toISOString();
            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
            await chrome.storage.local.set({'lastBackgroundPollTime': currentCheckTime});


            // Initialize times if they're empty
            lastAlertTime = lastAlertTime || fifteenMinutesAgo;
            lastBackgroundPollTime = lastBackgroundPollTime || fifteenMinutesAgo;
            if ( ! lastActivityPageViewTime ) {
                lastActivityPageViewTime = fifteenMinutesAgo;
                await chrome.storage.local.set({'lastActivityPageViewTime': lastActivityPageViewTime});
            } 

            // Start checks when the activity page was last viewed, or 15 minutes ago.
            const checkStartTime = lastActivityPageViewTime;

            // console.log(`Last alert time: ${lastAlertTime}`);
            // console.log(`Last notification time: ${lastBackgroundPollTime}`);
            // console.log(`Check start time: ${checkStartTime}`);

            accountsWithNewActivity = JSON.parse(accountsWithNewActivity || '[]');
            lastCheckedIndex = lastCheckedIndex || 0;

            // console.log(`Resuming check from index ${lastCheckedIndex}`);

            steemObserverName = await getStoredUser();
            apiNode = await getApiServerName();
            const followingList = await getFollowingListWithRetry(steemObserverName, apiNode);
            let newActivityFound = false;

            accountsWithNewActivity = await deleteNoFollows(followingList, accountsWithNewActivity);

            for (let i = lastCheckedIndex; i < followingList.length; i++) {
                const followedAccount = followingList[i];
                try {
                    let searchMin = new Date(checkStartTime); // Default in case there is no history for this time.
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
                    // const cT = new Date(`${lastAccountActivityObserved}`);

                    console.debug(`Comparing ${searchMin.toISOString()} and ${lastAccountActivityObserved.toISOString()} for user ${followedAccount}.`);
                    if (new Date (searchMin) < new Date (lastAccountActivityObserved)) {
                        // Activity observed after last notification
                        newActivityFound = true;
                        // First, check if the account already exists in accountsWithNewActivity
                        if (existingAccountIndex === -1) {
                            // The account doesn't exist in the array yet
                            // const lastAccountActivityObservedDate = new Date(lastAccountActivityObserved);
                            const oneSecondBefore = new Date(lastAccountActivityObserved.getTime() - 1000);
                            const newActivity = {
                                account: followedAccount,
                                activityTime: lastAccountActivityObserved,
                                lastDisplayTime: oneSecondBefore // .toISOString() // or whatever format you prefer
                            };
                            accountsWithNewActivity.push(newActivity);
                        } else {
                            // The account already exists, update its activityTime and keep the existing lastDisplayTime
                            const existingAccount = accountsWithNewActivity[existingAccountIndex];
                            existingAccount.activityTime = lastAccountActivityObserved;
                            accountsWithNewActivity[existingAccountIndex] = existingAccount;
                            // lastDisplayTime remains unchanged
                        }
//                        console.debug("Saved account.");
                    } else {
                        // Covered under previous notification.
                        existingAccountIndex = accountsWithNewActivity.findIndex(item => item.account === followedAccount);
                        if (existingAccountIndex !== -1) {
                            // console.debug(`accountsWithNewActivity: ${JSON.stringify(accountsWithNewActivity)}`);
                            accountsWithNewActivity = deleteTriplet(accountsWithNewActivity, followedAccount);
                            // console.debug(`Deleted account: ${followedAccount}`);
                            // console.debug(`accountsWithNewActivity: ${JSON.stringify(accountsWithNewActivity)}`);
                        // } else {
                        //      console.debug(`Account not in list: ${followedAccount}.`);
                        }
                    }

                    // Save progress every 10 accounts checked
                    if (i % 10 === 0) {
                        if (!(await updateLock('background'))) {
                            // console.log('Lost lock during processing in background.js');
                            isCheckingActivity = false;
                            await saveIsCheckingActivity(isCheckingActivity);
                            return;
                        }
                        await chrome.storage.local.set({
                            lastCheckedIndex: i,
                            accountsWithNewActivity: JSON.stringify(accountsWithNewActivity)
                        });
                    //    console.log(`Processed ${followedAccount} after ${checkStartTime}. Last activity: ${lastAccountActivityObserved.toISOString()}.`);
                    }

                    // Add a small delay to avoid overwhelming the API
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error) {
                    console.error(`Error checking activity for ${followedAccount}:`, error);
                    continue;
                }
            }

            console.log("Done checking activity times.");
            console.log(`newActivityFound: ${newActivityFound}`);
            console.log(`accountsWithNewActivity: ${JSON.stringify(accountsWithNewActivity)}`);

            if (newActivityFound) {
                const size = accountsWithNewActivity.length;
                console.log(`Number of accounts with new activity: ${size}`);
                const notificationMessage = `${size} of your followed accounts had posts, comments, or replies!`;
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
        } finally {
            await releaseLock();
            // console.log(`array lock cleared in checkForNewActivitySinceLastNotification ${steemObserverName}.`);
        }
    } else {
        // console.log('Could not acquire lock in background.js, will try again later');
    }
    isCheckingActivity = false;
    await saveIsCheckingActivity(isCheckingActivity);
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

async function getFollowingList(steemObserverName, apiNode, limit = 100) {
    let followingList = [];
    let start = null;

    // Retrieve stored progress
    const storedData = await chrome.storage.local.get(['lastFetchedUser', 'partialFollowingList']);
    if (storedData.lastFetchedUser && storedData.partialFollowingList) {
        start = storedData.lastFetchedUser;
        followingList = storedData.partialFollowingList;
        // console.log(`Resuming from ${start} with ${followingList.length} users already fetched.`);
    }

    try {
        // console.log(`Retrieving follower list for ${steemObserverName} from: ${apiNode}`);
        do {
            // Reset data before each request
            let data;
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
            data = await response.json();

            if (data.error) {
                // warn for single attempt, error in calling routine after retries.
                console.warn('Error fetching following list:', data.error.message);
                break;
            }

            if (data && data.result && Array.isArray(data.result)) {
                const users = data.result.map(user => user.following);
                followingList = followingList.concat(users);
                start = users.length === limit ? users[users.length - 1] : null;
                // console.log(`Fetched ${users.length} users. Next start: ${start}`);
                // Save progress after each successful fetch
                await chrome.storage.local.set({
                    lastFetchedUser: start,
                    partialFollowingList: followingList
                });
            } else {
                console.error('Unexpected API response structure:', data);
                break;
            }
        } while (start);

        followingList = Array.from(new Set(followingList));
        return followingList;
    } catch (error) {
        console.error('Error fetching following list:', error);
        // Save progress before throwing error
        await chrome.storage.local.set({
            lastFetchedUser: start,
            partialFollowingList: followingList
        });
        throw error; // Rethrow the error to be caught by getFollowingListWithRetry
    }
}

// async function getActivityTime(user, apiNode, startTime) {
//     //    console.log(`Getting account history for ${user} from ${startTime} until now.`);
//     try {
//         let lastTransaction = -1;
//         const transactionCount = 0;
//         const limit = 1;
//         const maxTransactions = 100;

//         while (transactionCount < maxTransactions) {
//             const postData = JSON.stringify({
//                 jsonrpc: '2.0',
//                 method: 'condenser_api.get_account_history',
//                 params: [user, lastTransaction, limit], // Keep fetching one at a time as in original
//                 id: 1
//             });

//             // console.log(`Fetching data for ${user}, transaction: ${lastTransaction}`);
//             const loopStartTime = new Date();

//             try {
//                 const response = await fetch(apiNode, {
//                     keepalive: true,
//                     method: 'POST',
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: postData
//                 });

//                 if (!response.ok) {
//                     const errorText = await response.text();
//                     console.error(`Response not OK when Fetching data for ${user}: ${response.status} ${errorText}`);
//                     return null;
//                 }

//                 const data = await response.json();

//                 if (data.error) {
//                     // warn for single attempt, error in calling routine after retries.
//                     console.warn(`Data error fetching data for ${user} / ${data.error.code}: ${data.error.message}`);
//                     return null;
//                 }

//                 if (!data.result || data.result.length < 1 || data.result[0].length < 2 || data.result[0][1].timestamp.length === 0) {
//                     // console.log(`No recent activity found for ${user}`);
//                     return null;
//                 }

//                 const [transId, transaction] = data.result[0];
//                 const {timestamp, op} = transaction;
//                 const [opType] = op;

//                 // console.log(`Transaction: ${transId}, Operation: ${opType}, Timestamp: ${timestamp}`);

//                 if (opType === 'comment') {
//                     return new Date(`${timestamp}Z`);
//                 }

//                 if (new Date(startTime) > new Date(`${timestamp}Z`)) {
//                     return new Date("1970-01-01T00:00:00Z");
//                 }

//                 lastTransaction = transId - 1;
//                 transactionCount++;

//                 if (transactionCount >= maxTransactions) {
//                     // console.log(`Processed ${maxTransactions} transactions: at ${lastTransaction} for ${user}. Bailing out.`);
//                     return new Date("1970-01-01T00:00:00Z");
//                 }

//                 const loopEndTime = new Date();
//                 // console.log(`Loop iteration took ${loopEndTime - loopStartTime}ms`);

//             } catch (fetchError) {
//                 // warn for single attempt, error in calling routine after retries.
//                 console.warn(`Fetch error for ${user}:`, fetchError);
//                 return null;
//             }
//         }

//         // console.log(`No comment found within ${maxTransactions} transactions for ${user}`);
//         return new Date("1970-01-01T00:00:00Z");

//     } catch (error) {
//         // warn for single attempt, error in calling routine after retries.
//         console.warn(`Unexpected error for ${user}:`, error);
//         return null;
//     }
// }

async function getActivityTime(user, apiNode, startTime) {
    try {
        let lastTransaction = -1;
        const chunkSize = 20;
        const maxChunks = 5; // This will check up to 100 transactions (5 * 20)

        for (let chunkIndex = 0; chunkIndex < maxChunks; chunkIndex++) {
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
                console.error(`Error fetching data for ${user}: ${response.status}`);
                return null;
            }

            const data = await response.json();

            if (data.error) {
                console.warn(`Data error for ${user}: ${data.error.message}`);
                return null;
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

chrome.runtime.onStartup.addListener(() => {
    setupAlarms();
});