/* global chrome */

// localStorageUtils.js

function getApiServerName() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['apiServerName'], function(result) {
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
    chrome.storage.sync.get(['webServerName'], function(result) {
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
        chrome.storage.sync.get(['username'], function (result) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result.username);
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