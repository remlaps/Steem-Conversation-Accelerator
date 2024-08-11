/* global chrome */

document.getElementById('saveButton').addEventListener('click', () => {
    const pollingTime = document.getElementById('pollingTime').value;
    const steemObserverName = document.getElementById('steemObserverName').value;
    const apiServerName = document.getElementById('apiServerName').value;
    const webServerName = document.getElementById('webServerName').value;

    chrome.storage.local.set({
        pollingTime: parseInt(pollingTime, 10),
        steemObserverName: steemObserverName,
        apiServerName: apiServerName,
        webServerName: webServerName
    }, () => {
        alert('Settings saved');
    });
});

// Load saved settings
window.onload = () => {
    chrome.storage.local.get(['pollingTime', 'steemObserverName', 'apiServerName', 'webServerName'], (result) => {
        if (result.pollingTime) {
            document.getElementById('pollingTime').value = result.pollingTime;
        }
        if (result.steemObserverName) {
            document.getElementById('steemObserverName').value = result.steemObserverName;
        }
        if (result.apiServerName) {
            document.getElementById('apiServerName').value = result.apiServerName;
        }
        if (result.webServerName) {
            document.getElementById('webServerName').value = result.webServerName;
        }
    });
};
