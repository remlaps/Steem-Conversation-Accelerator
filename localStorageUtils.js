/* global chrome */

// localStorageUtils.js

function getApiServerName() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['apiServerName'], function (result) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result.apiServerName);
            }
        });
    });
}

async function getWebServerName() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['webServerName'], function (result) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result.webServerName);
            }
        });
    });
}

function getStoredUser() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['steemObserverName'], function (result) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result.steemObserverName);
            }
        });
    });
}


function saveIsCheckingActivity(isCheckingActivity) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ isCheckingActivity: isCheckingActivity }, function () {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            console.log('Value is set to ' + isCheckingActivity);
            resolve();
        });
    });
}

async function getIsCheckingActivity() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['isCheckingActivity'], function (result) {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            const isCheckingActivity = result.isCheckingActivity !== undefined ? result.isCheckingActivity : false;
            resolve(isCheckingActivity);
        });
    });
}

async function acquireLock(scriptName, priority, maxStaleTime = 120000, maxWaitTime = 30000) {
    // Retry every 15 seconds for 30 seconds (maxWaitTime = 30000)
    // If lock is more than 2 minutes old (maxStaleTime = 120000), assume it's stale
    // - functions must use updateLock more frequently than once in 2 minutes in order to hold it.
    const startTime = Date.now();

    async function attemptLock() {
        const now = Date.now();
        const result = await chrome.storage.local.get(['processingLock', 'backgroundProgress']);
        console.log(`${scriptName} is attempting to acquire the lock`);

        if (result.processingLock && (now - result.processingLock.timestamp <= maxStaleTime) &&
            (priority <= result.processingLock.priority) && (scriptName !== result.processingLock.scriptName)) {
            console.debug(`Nope.  Lock attempt from ${scriptName} rejected.  Lock held by ${result.processingLock.scriptName}`);
        } else {
            if ( result.processingLock ) {
                if ( priority > result.processingLock.priority) {
                    console.log(`${scriptName} is preempting ${result.processingLock.scriptName}`);
                    // Reset background.js progress if it's preempted
                    if (result.processingLock.scriptName === 'background') {
                        await chrome.storage.local.set({ backgroundProgress: 0 });
                    }
                }

                if ( now - result.processingLock.timestamp > maxStaleTime ) {
                    console.log(`${scriptName}: claiming stale lock.`);
                }

                if ( scriptName === result.processingLock.scriptName) {
                    console.log(`${scriptName} claiming lock from itself.`);
                }
            }

            await chrome.storage.local.set({
                processingLock: {
                    scriptName: scriptName,
                    timestamp: now,
                    priority: priority
                }
            });
            console.debug(`${scriptName} got the lock.`);
            return true;
        }

        if (now - startTime < maxWaitTime) {
            await sleep(15);
            return await attemptLock();
        }

        return false;
    }

    return await attemptLock();
}

async function sleep(sleepTime) {
    const sleepMS = sleepTime * 1000;
    await new Promise(resolve => setTimeout(resolve, sleepMS));
}

async function updateLock(scriptName) {
    const result = await chrome.storage.local.get('processingLock');
    if (result.processingLock && result.processingLock.scriptName === scriptName) {
        console.log(`Lock going to ${scriptName}, previously held by ${result.processingLock.scriptName}`);
        await chrome.storage.local.set({
            processingLock: {
                ...result.processingLock,
                timestamp: Date.now()
            }
        });
        return true;
    } else if (result.processingLock) {
        console.log(`Lock update rejected for ${scriptName}.  Lock held by ${result.processingLock.scriptName}.`);
    }
    return false;
}

async function releaseLock(scriptName) {
    console.log(`${scriptName} is attempting to release the lock`);
    const result = await chrome.storage.local.get('processingLock');
    if (result.processingLock && result.processingLock.scriptName === scriptName) {
        await chrome.storage.local.remove('processingLock');
        console.log(`${scriptName} has successfully released the lock`);
        return true;
    }
    console.log(`${scriptName} failed to release the lock (not owner or lock not found)`);
    return false;
}

async function maintainDuplicateTable(author, permlink) {
    try {
      // Retrieve the current table from chrome local storage
      const currentTable = await chrome.storage.local.get('duplicateTable');
      const table = currentTable.duplicateTable || [];
  
      // Check if the current author/permlink is in it
      const isDuplicate = table.some(item => item.author === author && item.permlink === permlink);
  
      // If not, add it
      if (!isDuplicate) {
        table.push({ author, permlink });
  
        // Save the table
        await chrome.storage.local.set({ duplicateTable: table });
      }
  
      return !isDuplicate;
    } catch (error) {
      console.error('Error in maintainDuplicateTable:', error);
      throw error;
    }
  }

  async function deleteDuplicateTable() {
    try {
      await chrome.storage.local.remove('duplicateTable');
    } catch (error) {
      console.error('Error deleting duplicateTable:', error);
      throw error;
    }
  }