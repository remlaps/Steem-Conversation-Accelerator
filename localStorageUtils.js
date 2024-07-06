/* global chrome */

// localStorageUtils.js

function getApiServerName() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['apiServerName'], function(result) {
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
    chrome.storage.local.get(['webServerName'], function(result) {
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
        chrome.storage.local.get(['steemUsername'], function (result) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result.steemUsername);
            }
        });
    });
}

async function getLastAlertTime() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['lastAlertTime'], function (result) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result.lastAlertTime || '2024-01-01T00:00:00Z'); // Default start time if not set
            }
        });
    });
}

async function getPreviousAlertTime() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['previousAlertTime'], function (result) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result.previousAlertTime || '2024-01-01T00:00:00Z'); // Default start time if not set
            }
        });
    });
}


function saveIsCheckingActivity(isCheckingActivity) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ isCheckingActivity: isCheckingActivity }, function() {
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
        chrome.storage.local.get(['isCheckingActivity'], function(result) {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            const isCheckingActivity = result.isCheckingActivity !== undefined ? result.isCheckingActivity : false;
            resolve(isCheckingActivity);
        });
    });
}

async function acquireLock(scriptName, priority, maxStaleTime = 10000, maxWaitTime = 900000) {
    const startTime = Date.now();
    
    async function attemptLock() {
        const now = Date.now();
        const result = await chrome.storage.local.get(['processingLock', 'backgroundProgress']);
        console.log(`${scriptName} is attempting to acquire the lock`);
        
        if (!result.processingLock || (now - result.processingLock.timestamp > maxStaleTime) ||
            (priority > result.processingLock.priority)) {
            
            if (result.processingLock && priority > result.processingLock.priority) {
                console.log(`${scriptName} is preempting ${result.processingLock.scriptName}`);
                // Reset background.js progress if it's preempted
                if (result.processingLock.scriptName === 'background') {
                    await chrome.storage.local.set({ backgroundProgress: 0 });
                }
            }
            
            await chrome.storage.local.set({
                processingLock: {
                    scriptName: scriptName,
                    timestamp: now,
                    priority: priority
                }
            });
            return true;
        }
        
        if (now - startTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 15000));
            return attemptLock();
        }
        
        return false;
    }
    
    return attemptLock();
}

async function updateLock(scriptName) {
    const result = await chrome.storage.local.get('processingLock');
    if (result.processingLock && result.processingLock.scriptName === scriptName) {
        await chrome.storage.local.set({
            processingLock: {
                ...result.processingLock,
                timestamp: Date.now()
            }
        });
        return true;
    }
    return false;
}

async function releaseLock(scriptName) {
    const result = await chrome.storage.local.get('processingLock');
    if (result.processingLock && result.processingLock.scriptName === scriptName) {
        await chrome.storage.local.remove('processingLock');
        return true;
    }
    return false;
}