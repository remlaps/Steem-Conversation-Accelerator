/* global chrome, steem */

if (typeof browser === "undefined") {
    var browser = chrome;
}

// Import additional scripts
importScripts('localStorageUtils.js');

// Detect browser idle state
chrome.idle.onStateChanged.addListener(state => {
    if (state === 'idle') {
        // Browser is idle, disable the onAlarm listener
        console.log("Browser is idle.  Disabling the alarms.");
        showAlarms();
        clearAlarms();
    } else if (state === 'active') {
        // Browser is active, re-enable the onAlarm listener
        console.log("Browser is active.  Setting the alarms.");
        setupAlarms(); 
        showAlarms();
    }
});

function showAlarms() {
    // Get all scheduled alarms
    chrome.alarms.getAll(alarms => {
        if (alarms.length === 0) {
            console.log('No alarms currently scheduled.');
        } else {
            console.log('Currently scheduled alarms:');
            alarms.forEach(alarm => {
                console.log(`- Alarm "${alarm.name}" at ${new Date(alarm.scheduledTime)}`);
            });
        }
    });
}

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
    let pollingTime = 7;
    chrome.storage.sync.get(['pollingTime'], async (result) => {
        if (result.pollingTime) {
            pollingTime = result.pollingTime;
            console.log(`Setting alarm with polling time: ${result.pollingTime}`);
            chrome.alarms.create('checkSteemActivity', {periodInMinutes: pollingTime});
        } else {
            console.log(`Setting alarm with polling time: ${pollingTime}`);
            chrome.alarms.create('checkSteemActivity', {periodInMinutes: pollingTime});
        }
        showAlarms();
    });
}

chrome.runtime.onInstalled.addListener(function(details) {
    if (details.reason === 'install') {
        chrome.windows.create({
            url: chrome.runtime.getURL('popup.html'),
            type: 'popup',
            width: 500,
            height: 600
        });
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    async function resetAfterChanges() {
        if (namespace === 'sync') {
            await clearAlarms();
            await setupAlarms();
        }
    }
    resetAfterChanges();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkSteemActivity') {
        chrome.storage.local.get(['steemUsername'], async (result) => {
            const username = result.steemUsername;
            if (username) {
                checkForNewActivitySinceLastAlert(username);
            } else {
                console.error('Steem username not set. Please set it in the extension settings.');
            }
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_USERNAME') {
        chrome.storage.local.get(['steemUsername'], (result) => {
            sendResponse(result.steemUsername);
        });
        return true; // Will respond asynchronously
    }
});

let accountsWithNewActivity = []; // must be global to pass to activityList.
let savedAccountList = [];

let isCheckingActivity = false;

async function checkForNewActivitySinceLastAlert(username) {
    if (isCheckingActivity) {
        console.log('checkForNewActivitySinceLastAlert is already running.');
        return;
    }

    isCheckingActivity = true;
    try {
        clearAlarms();
    } catch {
    }
    try {
        let result = await chrome.storage.local.get('lastAlertTime'); // These two lines don't do anything except declaring the variable(?)
        let lastAlertTime = result.lastAlertTime; // These two lines don't do anything except declaring the variable(?)

        accountsWithNewActivity = savedAccountList;
        if (!lastAlertTime) {
            const now = new Date();
            lastAlertTime = now.toISOString(); // Initialize with current UTC date and time if not previously set
            
            // Save in chrome.storage.local
            await chrome.storage.local.set({ 'lastAlertTime': lastAlertTime });
        } else {
            lastAlertTime = new Date(lastAlertTime);
            lastAlertTime.setMinutes(lastAlertTime.getMinutes() + lastAlertTime.getTimezoneOffset()); // Adjust to UTC time
        }
        console.log("Checking for new activity after ", lastAlertTime);

        let newActivityFound = false;
        username = await getStoredUser();
        apiNode = await getApiServerName();
        
        const followingList = await getFollowingList(username, apiNode);

        for (let user of followingList) {
            const currentActivityTime = await getActivityTime(user, apiNode);
            if (!currentActivityTime) {
                console.log(`Failed to fetch activity time for ${user}. Skipping.`);
                continue; // Skip to the next user if fetching activity time fails
            }

            if (new Date(currentActivityTime) > lastAlertTime) {
                newActivityFound = true;
                accountsWithNewActivity.push(user);
                console.log(`New activity from ${user} since your last check!`);
            }
        }
        
        if (newActivityFound) {
            const size = accountsWithNewActivity.length;
            const notificationMessage = `${size} new post(s) or comment(s) were observed from your followed account(s)!`;
            chrome.storage.local.set({accountsWithNewActivity: JSON.stringify(accountsWithNewActivity)}); // Save to local storage
            displayBrowserNotification(notificationMessage);
            savedAccountList = accountsWithNewActivity;
        }
            
        // Save lastAlertTime to chrome.storage.local
         chrome.storage.local.set({ 'lastAlertTime': new Date().toISOString() }, function() {
             if (chrome.runtime.lastError) {
                 console.error('Error saving lastAlertTime to storage:', chrome.runtime.lastError);
             }
         });
    
    } catch (error) {
        console.error('Error checking for new activity since last alert:', error);
    } finally {
        setupAlarms();
        isCheckingActivity = false;
    }
}

function displayBrowserNotification(message) {
    console.log("account list: ", accountsWithNewActivity, " in displayBrowserNotification.");
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
    chrome.tabs.create({url: chrome.runtime.getURL('activityList.html')});
    savedAccountList = [];
});

async function getFollowingList(username, apiNode, limit = 100) {
    let followingList = [];
    let start = '';
    try {
        console.log(`Retrieving follower list for ${username} from: ${apiNode}`);

        do {
            const response = await fetch(apiNode, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'follow_api.get_following',
                    params: [username, start, 'blog', limit],
                    id: 1
                })
            });
            const data = await response.json();

            if (data.error) {
                console.error('Error fetching following list:', data.error.message);
                break; // Exit loop on error
            }

            const users = data.result.map(user => user.following);
            followingList = followingList.concat(users);

            // Update start for the next request
            start = users.length === limit ? users[users.length - 1] : null;

            // Log current iteration
            console.log(`Fetched ${users.length} users. Next start: ${start}`);
        } while (start);

        // Remove duplicates (in case of pagination overlap)
        followingList = Array.from(new Set(followingList));

        // Return the followingList as part of the result
        return followingList;
    } catch (error) {
        console.error('Error fetching following list:', error);
        // Return an empty array or handle the error as needed
        return [];
    }
}

async function getActivityTime(user, apiNode="https://api.steemit.com") {
    try {
//        console.log(`Checking ${apiNode} for new activity by ${user}`);
        const response = await fetch(apiNode, {
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

        const data = await response.json();
        if (data.error) {
            console.log(`Data error while fetching last post time for ${user}:`, data.error.message);
            return null; // Return null on error
        }

        const lastPostTime = data.result.accounts[0].last_post;
//        console.log(`Last post time for ${user}: ${lastPostTime}`);
        return lastPostTime; // Return last post time
    } catch (error) {
        console.error(`Error fetching last post time for ${user}:`, error);
        return null; // Return null on exception
    }
}

async function updateActivityTimes(followingList, lastActivityTimes) {
    for (let follower of followingList) {
        const history = await steem.api.getAccountHistoryAsync(follower, -1, 1);
        if (history.length) {
            lastActivityTimes[follower] = history[0][1].timestamp;
        }
    }
}

async function initializeAlertTime() {
    const now = new Date();
    const lastAlertTime = now.toISOString(); // Initialize with current UTC date and time if not previously set
    
    // Save in chrome.storage.local
    await chrome.storage.local.set({ 'lastAlertTime': lastAlertTime });
    
    setupAlarms();
    console.log("Done setting up alarms at initialization.");
    showAlarms();
}

initializeAlertTime();
