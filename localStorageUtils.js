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

async function acquireLock(scriptName, priority, maxStaleTime = 120000, maxWaitTime = 30000) {
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
            console.debug(`${scriptName} got the lock.`);
            return true;
        } else if ( result.processingLock ) { 
            console.debug(`Nope.  Lock held by ${result.processingLock.scriptName}`);
        }
        
        if (now - startTime < maxWaitTime) {
            await sleep (15);
            return attemptLock();
        }
        
        return false;
    }
    
    return attemptLock();
}

async function sleep ( sleepTime ) {
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
    } else if ( result.processingLock ) {
        console.log(`Lock update rejected for ${scriptName}.  Lock held by ${result.processingLock.scriptName}.`);
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