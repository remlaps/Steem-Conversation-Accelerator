function showTriplet(showAccount) {
    console.log(`Steem account: ${showAccount.account}`);
    console.log(`Last activity: ${formatDate(showAccount.activityTime)}`);
    console.log(`Last display: ${formatDate(showAccount.lastDisplayTime)}`);
}

function formatDate(dateInput) {
    if (dateInput instanceof Date) {
        return dateInput.toISOString();
    } else if (typeof dateInput === 'string') {
        try {
            return new Date(dateInput).toISOString();
        } catch (e) {
            return `Invalid date (${dateInput})`;
        }
    } else {
        return `Unsupported date format (${dateInput})`;
    }
}

function isEmptyActivityList(activities) {
    const { postList, commentList, replyList } = activities;
    
    return (!postList || postList.length === 0) &&
           (!commentList || commentList.length === 0) &&
           (!replyList || replyList.length === 0);
}

function getLastActivityTimeFromAll(activities) {
    const { postList, commentList, replyList } = activities;
    let lastActivity = new Date("1970-01-01T00:00:00Z");

    function updateLastActivity(items) {
        for (const item of items) {
            const itemTime = new Date(`${item[1].timestamp}Z`);
            lastActivity = newerDate(lastActivity, itemTime);
        }
    }

    updateLastActivity(postList);
    updateLastActivity(commentList);
    updateLastActivity(replyList);

    return lastActivity;
}

function updateLastDisplayTime(accountsList, accountToUpdate, activityTime ) {
    const activityTimeStr = new Date (`${activityTime}`).toISOString();
    return accountsList.map(item => {
      if (item.account === accountToUpdate) {
        // console.debug(`Account: ${accountToUpdate}, display time: ${item.lastDisplayTime}, activity time: ${item.activityTime}`);
        return {
          account: accountToUpdate,
          lastDisplayTime: activityTimeStr,
          activityTime: activityTimeStr
        };
      }
      return item;
    });
  }

  // Function to retrieve stored accountsWithNewActivity from chrome.storage.local
async function getStoredAccountsWithNewActivity() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get('accountsWithNewActivity', function (result) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result.accountsWithNewActivity);
            }
        });
    });
}

// Function to save stored accountsWithNewActivity in chrome.storage.local
async function saveStoredAccountsWithNewActivity(uniqueAccountsWithNewActivity) {
    return new Promise((resolve, reject) => {
        console.log("Inside: saveStoredAccountsWithNewActivity");
        chrome.storage.local.set({ 'accountsWithNewActivity': JSON.stringify(uniqueAccountsWithNewActivity) }, function () {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
}

function newerDate(date1, date2) {
    return new Date(date1) > new Date(date2) ? date1 : date2;
}

/*
 * Remove duplicates using a Set and convert back to an Array
 */
function filterUniqueAccounts(accountsWithNewActivity) {
    let result = [];
    
    try {
        const parsedAccounts = JSON.parse(accountsWithNewActivity);
        const uniqueAccounts = {};

        for (const item of parsedAccounts) {
            if (!uniqueAccounts[item.account]) {
                uniqueAccounts[item.account] = item;
            } else {
                uniqueAccounts[item.account].activityTime = newerDate(uniqueAccounts[item.account].activityTime, item.activityTime);
                uniqueAccounts[item.account].lastDisplayTime = newerDate(uniqueAccounts[item.account].lastDisplayTime, item.lastDisplayTime);
            }
        }

        result = Object.values(uniqueAccounts);
    } catch (error) {
        console.warn("Error in filterUniqueAccounts:", error);
    }

    return result;
}

async function getSteemAccountName(user, apiNode) {
    let accountName = null;
    const accountInfo = await getSteemAccountInfo(user, apiNode);
    
    if (accountInfo?.result?.accounts[0]) {
        accountName = accountInfo.result.accounts[0].name;
    } else {
        console.warn(`No account information found for ${user}`);
    }
    return accountName;
}

function showAlarms() {
    // Get all scheduled alarms
    chrome.alarms.getAll(alarms => {
        if (alarms.length === 0) {
            console.log('No alarms currently scheduled.');
        } else {
            // console.log('Currently scheduled alarms:');
            alarms.forEach(alarm => {
                // const gmtTime = new Date(alarm.scheduledTime).toISOString();
                console.log(`- Alarm "${alarm.name}" at ${new Date(alarm.scheduledTime)}`);
            });
        }
    });
}

async function getNextPollingTime() {
    return new Promise((resolve, reject) => {
      chrome.alarms.getAll((alarms) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
  
        const checkSteemActivityAlarm = alarms.find(alarm => alarm.name === 'checkSteemActivity');
  
        if (!checkSteemActivityAlarm) {
          resolve(null); // No alarm found
          return;
        }
  
        const nextAlarmTime = new Date(checkSteemActivityAlarm.scheduledTime);
  
        resolve(nextAlarmTime);
      });
    });
  }

  async function clearAllNotifications()
{
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
}
