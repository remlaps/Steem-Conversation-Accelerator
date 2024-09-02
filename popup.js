/* global chrome */

document.getElementById('saveButton').addEventListener('click', () => {
    const pollingTime = document.getElementById('pollingTime').value;
    const steemObserverName = document.getElementById('steemObserverName').value;
    const apiServerName = document.getElementById('apiServerName').value;
    const webServerName = document.getElementById('webServerName').value;

    console.debug(`In document: steemObserverName - ${steemObserverName}`);
    getSteemAccountName(steemObserverName, apiServerName)
    .then(accountName => {
        console.debug(`Steem Observer Account: ${accountName}`);
        if (accountName === steemObserverName ) {
            chrome.storage.local.set({
                pollingTime: parseInt(pollingTime, 10),
                steemObserverName: accountName,
                apiServerName: apiServerName,
                webServerName: webServerName
            }, () => {
                alert('Settings saved');
            });
        } else {
            alert(`Steem observer account ${steemObserverName} could not be verified.  Found ${accountName}`);
        }
    })
    .catch(error => {
        console.error("An error occurred:", error);
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
