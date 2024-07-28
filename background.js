/* global chrome, steem */

if (typeof browser === "undefined") {
    var browser = chrome;
}

// Import additional scripts
importScripts('localStorageUtils.js');

chrome.runtime.onInstalled.addListener(function (details) {
    let pluginStartTime = new Date().toISOString();
    if (details.reason === 'install') {
        console.log(`plugin installed at ${pluginStartTime}`);
        chrome.storage.sync.clear();
        chrome.storage.local.clear();
        chrome.windows.create({
            url: chrome.runtime.getURL('popup.html'),
            type: 'popup',
            width: 500,
            height: 600
        });

    } else if (details.reason === 'update') {
        console.log(`plugin updated at ${pluginStartTime}`);
    }
    chrome.storage.local.get(['steemUsername'], async (result) => {
        const steemUsername = result.steemUsername;
        if (steemUsername) {
            // This should probably never happen, since local storage was cleared above.
            // The onChanged listener sets an alarm when the username and polling time are entered.
            await saveIsCheckingActivity(false);
            await checkForNewActivitySinceLastNotification(steemUsername);
            await setupAlarms();
        } else {
            console.log('Steem username not set for SCA. Please set it in the extension settings.');
        }
    });
    showAlarms();
});


chrome.storage.onChanged.addListener((changes, area) => {

    function resetAfterChanges() {
        clearAlarms();
        setupAlarms();
    }

    if (area === 'local' && ('steemUserName' in changes || 'pollingTime' in changes)) {
        console.log('Changes observed:', JSON.stringify(changes, null, 2));
        resetAfterChanges();
        showAlarms();
    }
});

chrome.idle.onStateChanged.addListener(state => {
    if (state === 'idle') {
        // Browser is idle, disable the onAlarm listener
        console.log("Browser is idle.  Disabling the alarms.");
        clearAlarms();
    } else if (state === 'active') {
        // Browser is active, re-enable the onAlarm listener
        console.log("Browser is active.  Setting the alarms.");
        setupAlarms();
    }
});


chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkSteemActivity') {
        console.log("Alarm recieved.");
        chrome.storage.local.get(['steemUsername'], async (result) => {
            const steemUsername = result.steemUsername;
            if (steemUsername) {
                await checkForNewActivitySinceLastNotification(steemUsername);
            } else {
                console.log('Alarm triggered, but the Steem username is not set in SCA.');
                console.log('Please set it in the extension settings.');
            }
        });
        console.log("Ending alarm processing.");
    }
});


/***
 * 
 * Alarm methods begin here:
 *    - clearAlarms()
 *    - setupAlarms()
 *    - showAlarms()
 * 
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
            console.log('Currently scheduled alarms:');
            alarms.forEach(alarm => {
                const gmtTime = new Date(alarm.scheduledTime).toISOString();
                console.log(`- Alarm "${alarm.name}" at ${new Date(alarm.scheduledTime)}`);
            });
        }
    });
}

async function getActivityTimeWithRetry(followedAccount, apiNode, startTime, retries = 3) {
    try {
        const currentActivityTime = await getActivityTime(followedAccount, apiNode, startTime);
        if (currentActivityTime !== null) {
            return currentActivityTime;
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

async function getFollowingListWithRetry(steemUsername, apiNode, retries = 10) {
    while (retries > 0) {
        try {
            const followingList = await getFollowingList(steemUsername, apiNode);
            // Clear the stored progress after successful completion
            await chrome.storage.local.remove(['lastFetchedUser', 'partialFollowingList']);
            return followingList;
        } catch (error) {
            retries--;
            console.warn(`Failed to get following list for ${steemUsername}. Retrying in 1 second.`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    console.error(`Retry limit exceeded. Failed to get following list. Skipping ${steemUsername}...`);
    return [];
}

let accountsWithNewActivity = []; // must be global to pass to activityList.
let savedAccountList = [];

let isCheckingActivity = false;
saveIsCheckingActivity(isCheckingActivity);
async function checkForNewActivitySinceLastNotification(steemUsername) {
    let isCheckingActivity = await getIsCheckingActivity();
    if (isCheckingActivity) {
        console.log('checkForNewActivitySinceLastNotification is already running.');
        return;
    }
    isCheckingActivity = true;
    await saveIsCheckingActivity(isCheckingActivity);
    if (await acquireLock('background', 1)) { // Lower priority
        console.log(`array lock set in checkForNewActivitySinceLastNotification ${steemUsername}.`);
        try {


            // Retrieve stored progress
            let {lastAlertTime, lastNotificationTime, accountsWithNewActivity, lastCheckedIndex} =
                    await chrome.storage.local.get(['lastAlertTime', 'lastNotificationTime', 'accountsWithNewActivity', 'lastCheckedIndex']);

            const currentCheckTime = new Date().toISOString();
            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
            if (!lastNotificationTime) {
                await chrome.storage.local.set({lastNotificationTime: fifteenMinutesAgo});
            }

            // Initialize lastAlertTime if it doesn't exist
            lastAlertTime = lastAlertTime || fifteenMinutesAgo;

            // Initialize lastNotificationTime if it doesn't exist
            lastNotificationTime = lastNotificationTime || lastAlertTime;

            // Use the more recent of lastNotificationTime and fifteenMinutesAgo as the start time for checking
            const checkStartTime = new Date(Math.max(new Date(lastNotificationTime), new Date(fifteenMinutesAgo))).toISOString();

            console.log(`Last alert time: ${lastAlertTime}`);
            console.log(`Last notification time: ${lastNotificationTime}`);
            console.log(`Check start time: ${checkStartTime}`);

            accountsWithNewActivity = JSON.parse(accountsWithNewActivity || '[]');
            lastCheckedIndex = lastCheckedIndex || 0;

            console.log(`Resuming check from index ${lastCheckedIndex}`);

            let newActivityFound = accountsWithNewActivity.length > 0;
            steemUsername = await getStoredUser();
            apiNode = await getApiServerName();
            const followingList = await getFollowingListWithRetry(steemUsername, apiNode);

            for (let i = lastCheckedIndex; i < followingList.length; i++) {
                const followedAccount = followingList[i];
                try {
                    let sT=new Date(checkStartTime);
                    const existingAccountIndex = accountsWithNewActivity.findIndex(item => item.account === followedAccount);
                    if (existingAccountIndex !== -1) {
                        sT=new Date(accountsWithNewActivity[existingAccountIndex].lastDisplayTime);
                    }

                    const currentActivityTime = await getActivityTimeWithRetry(followedAccount, apiNode, sT );
                    if (currentActivityTime === null) {
                        console.warn(`Failed to fetch activity time for ${followedAccount}. Skipping.`);
                        continue;
                    }
                    const cT = new Date(`${currentActivityTime}Z`);


                    if (sT < cT) {
                        newActivityFound = true;
                        // First, check if the account already exists in accountsWithNewActivity
                        if (existingAccountIndex === -1) {
                            // The account doesn't exist in the array yet
                            const currentActivityTimeDate = new Date(currentActivityTime);
                            const oneSecondBefore = new Date(currentActivityTimeDate.getTime() - 1000);
                            const newActivity = {
                                account: followedAccount,
                                activityTime: currentActivityTime,
                                lastDisplayTime: oneSecondBefore.toISOString() // or whatever format you prefer
                            };
                            accountsWithNewActivity.push(newActivity);
                        } else {
                            // The account already exists, update its activityTime and keep the existing lastDisplayTime
                            const existingAccount = accountsWithNewActivity[existingAccountIndex];
                            existingAccount.activityTime = currentActivityTime;
                            accountsWithNewActivity[existingAccountIndex] = existingAccount;
                            // lastDisplayTime remains unchanged
                        }
                    } else {
                        // nothing to do right now.
                    }

                    // Save progress every 10 accounts checked
                    if (i % 10 === 0) {
                        if (!(await updateLock('background'))) {
                            console.log('Lost lock during processing in background.js');
                            isCheckingActivity = false;
                            await saveIsCheckingActivity(isCheckingActivity);
                            return;
                        }
                        await chrome.storage.local.set({
                            lastCheckedIndex: i,
                            accountsWithNewActivity: JSON.stringify(accountsWithNewActivity)
                        });
                        console.log(`Processed ${followedAccount} after ${checkStartTime}. Last activity: ${currentActivityTime}.`);
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
                const notificationMessage = `${size} new post(s) or comment(s) were observed from your followed account(s)!`;
                await chrome.storage.local.set({
                    accountsWithNewActivity: JSON.stringify(accountsWithNewActivity),
                    currentCheckTime: currentCheckTime
                });
                try {
                    await displayBrowserNotification(notificationMessage);
                    console.log("Browser notification displayed successfully.");
                } catch (error) {
                    console.error("Error displaying browser notification:", error);
                }
            } else {
                console.log("No new activity found, skipping notification.");
            }

            // Update lastAlertTime
            await chrome.storage.local.set({
                'lastAlertTime': currentCheckTime,
                'lastCheckedIndex': 0
            });

        } catch (error) {
            console.error('Error checking for new activity since last alert:', error);
        } finally {
            await releaseLock();
            console.log(`array lock cleared in checkForNewActivitySinceLastNotification ${steemUsername}.`);
        }
    } else {
        console.log('Could not acquire lock in background.js, will try again later');
    }
    isCheckingActivity = false;
    await saveIsCheckingActivity(isCheckingActivity);
}
    
async function displayBrowserNotification(message) {
  console.log("account list: ", accountsWithNewActivity, " in displayBrowserNotification.");
  
    // Clear all notifications created by this extension
    await chrome.notifications.getAll(function (notifications) {
        for (let notificationId in notifications) {
            if (notifications.hasOwnProperty(notificationId)) {
                chrome.notifications.clear(notificationId, function (wasCleared) {
                    if (wasCleared) {
                        console.log(`Notification ${notificationId} cleared.`);
                    } else {
                        console.log(`Notification ${notificationId} could not be cleared.`);
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

async function getFollowingList(steemUsername, apiNode, limit = 1000) {
    let followingList = [];
    let start = '';

    // Retrieve stored progress
    const storedData = await chrome.storage.local.get(['lastFetchedUser', 'partialFollowingList']);
    if (storedData.lastFetchedUser && storedData.partialFollowingList) {
        start = storedData.lastFetchedUser;
        followingList = storedData.partialFollowingList;
        console.log(`Resuming from ${start} with ${followingList.length} users already fetched.`);
    }

    try {
        console.log(`Retrieving follower list for ${steemUsername} from: ${apiNode}`);
        do {
            const response = await fetch(apiNode, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'condenser_api.get_following',
                    params: [steemUsername, start, 'blog', limit],
                    id: 1
                })
            });
            const data = await response.json();
            if (data.error) {
                console.error('Error fetching following list:', data.error.message);
                break;
            }
            const users = data.result.map(user => user.following);
            followingList = followingList.concat(users);
            start = users.length === limit ? users[users.length - 1] : null;
            console.log(`Fetched ${users.length} users. Next start: ${start}`);

            // Save progress after each successful fetch
            await chrome.storage.local.set({
                lastFetchedUser: start,
                partialFollowingList: followingList
            });

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

async function getActivityTime(user, apiNode, startTime) {
//    console.log(`Getting account history for ${user} from ${startTime} until now.`);
    try {
        let lastTransaction = -1;
        let transactionCount = 0;
        const currentTime = new Date().toUTCString();

        while (true) {
            const postData = JSON.stringify({
                jsonrpc: '2.0',
                method: 'condenser_api.get_account_history',
                params: [user, lastTransaction, transactionCount],
                id: 1
            });

            loopTime=new Date();
            const response = await fetch(apiNode, {
                keepalive: true,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: postData
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Response not OK when Fetching data for ${user}: ${errorText}`);
                return null;
            }

            const data = await response.json();
            if (data.error) {
                console.error(`Data error fetching data for ${user} / ${data.error.code}: ${data.error.message}`);
                return null;
            }

            if (!data.result || data.result.length < 1 || data.result[0].length < 2 || data.result[0][1].timestamp.length === 0) {
                console.log(`No recent activity found for ${user}`);
                return null;
            }

            const timestamp = data.result[0][1].timestamp;
            let transId = data.result[0][0];
            let opType = data.result[0][1].op[0];
//            console.log(`looping: ${loopTime}, startTime: ${startTime}`);
//            console.log(`transaction: ${transId}, operation: ${opType}, timestamp: ${timestamp}`);

            // Check if the operation is a comment
            if (opType === 'comment') {
                return timestamp;
            }

            // Check if the transaction was before startTime.
            const transactionTime = new Date(timestamp).toUTCString();
            if ( newerDate ( startTime, transactionTime )) { 
                return "1970-01-01T00:00:00";
            }

            // Decrement the transaction ID for the next iteration
            lastTransaction = transId -1;
        }
    } catch (error) {
        console.error(`Error fetching last post time for ${user}:`, error);
        return null;
    }
}

function newerDate(date1, date2) {
    return new Date(date1) > new Date(date2) ? date1 : date2;
}

/*
 * Replacing with get_account_history call
 * 
 */

async function getLastPost(user, apiNode) {
    try {
        response = await fetch(apiNode, {
            keepalive: true,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'database_api.list_accounts',
                params: {
                    start: user,
                    limit: 1,
                    order: 'by_name'
                },
                id: 1
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`Error response: ${errorText}`);
            return null;
        }

        const data = await response.json();
//        console.log(`Response data: ${JSON.stringify(data, null, 2)}`);

        if (data.error) {
            console.warn(`Data error while fetching last post time for ${user}:`, data.error.message);
            return null; // Return null on error
        }

        if (!data.result || !data.result.accounts || data.result.accounts.length === 0) {
            console.warn(`No accounts found for ${user}`);
            return null; // No accounts found
        }

        const lastPostTime = data.result.accounts[0].last_post;
        return lastPostTime; // Return last post time
    } catch (error) {
        console.error(`Error fetching last post time for ${user}:`, error);
        return null; // Return null on exception
    } finally {
    }
}

/*
 * Not in use(?)
 */
//async function updateActivityTimes(followingList, lastActivityTimes) {
//    for (let follower of followingList) {
//        const history = await steem.api.getAccountHistoryAsync(follower, -1, 1);
//        if (history.length) {
//            lastActivityTimes[follower] = history[0][1].timestamp;
//        }
//    }
//}

async function initializeAlertTime() {
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const lastAlertTime = fifteenMinutesAgo.toISOString(); // Initialize with current UTC date and time if not previously set
    
    // Save in chrome.storage.local
    await chrome.storage.local.set({ 'lastAlertTime': lastAlertTime });
    
    console.log("Done setting up alarms at initialization.");
}

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
});