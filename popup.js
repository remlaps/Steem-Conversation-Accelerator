/* global chrome */

document.getElementById('saveButton').addEventListener('click', () => {
    const pollingTime = document.getElementById('pollingTime').value;
    const username = document.getElementById('username').value;
    const apiServerName = document.getElementById('apiServerName').value;
    const webServerName = document.getElementById('webServerName').value;

    chrome.storage.sync.set({
        pollingTime: parseInt(pollingTime, 10),
        username: username,
        apiServerName: apiServerName,
        webServerName: webServerName
    }, () => {
        alert('Settings saved');
    });
    
    chrome.storage.local.set({steemUsername: username}, () => {
        console.log(`Username ${username} saved!`);
    });
});

// Load saved settings
window.onload = () => {
    chrome.storage.sync.get(['pollingTime', 'username', 'apiServerName', 'webServerName'], (result) => {
        if (result.pollingTime) {
            document.getElementById('pollingTime').value = result.pollingTime;
        }
        if (result.username) {
            document.getElementById('username').value = result.username;
            chrome.storage.local.set({steemUsername: result.username}, () => {
                console.log(`Username ${result.username} saved!`);
            });
        }
        if (result.apiServerName) {
            document.getElementById('apiServerName').value = result.apiServerName;
        }
        if (result.webServerName) {
            document.getElementById('webServerName').value = result.webServerName;
        }
    });
};
