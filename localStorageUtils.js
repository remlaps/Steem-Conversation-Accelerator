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
