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


    async function displayActivityInfo() {
        const [lockInfo] = await Promise.all([checkLockSync()]);
        if (lockInfo) {
            lockOwner = lockInfo.owner;
            lockTime = lockInfo.lockedAt;

            // Set HTML elements
            document.getElementById('lockStatusText').textContent = `${lockOwner}`;
            document.getElementById('lockStatusTime').textContent = new Date(lockTime).toLocaleString();
        } else {
            // Handle the case where there's no lock
            document.getElementById('lockStatusText').textContent = 'Paused';
            document.getElementById('lockStatusTime').textContent = '-';
        }
        document.getElementById('nextPollTime').textContent = await getNextPollingTime();
        console.log(`Next alarm time: ${await getNextPollingTime()}`);
    }

    displayActivityInfo();

    // Repeat every 15 seconds
    let intervalId = setInterval(displayActivityInfo, 15000);

    // Clear the interval when the window is closed
    window.addEventListener('beforeunload', () => {
        clearInterval(intervalId);
    });

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
