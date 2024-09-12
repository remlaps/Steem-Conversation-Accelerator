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
                console.log("Settings saved");
                showCustomAlert('Settings saved');
            });
        } else {
            showCustomAlert(`Steem observer account ${steemObserverName} could not be verified.`);
        }
    })
    .catch(error => {
        console.error("An error occurred:", error);
    });
});

// Load saved settings
window.onload = () => {
    // Make the window fit the HTML body.
    resizeWindow();

    /*
     * custom alert button that's small enough to fit in the popup window.
     */
    // Get the custom alert OK button
    const customAlertOkButton = document.getElementById('customAlertOkButton');
    // Add click event listener to the custom alert OK button
    customAlertOkButton.addEventListener('click', closeCustomAlert);

    async function displayActivityInfo() {
        const [lockInfo, nextPollTime] = await Promise.all([checkLockSync(), getNextPollingTime()]);
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
        document.getElementById('nextPollTime').textContent = nextPollTime ? nextPollTime.toLocaleString() : '-';
        console.log(`Next alarm time: ${nextPollTime}`);
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

function resizeWindow() {
    // Get the element with the class 'popup-settings-body'
    const popupBody = document.querySelector('.popup-settings-body');

    if (!popupBody) {
        console.error('Element with class .popup-settings-body not found');
        return;
    }

    // Get the computed style of the popup body
    const popupStyle = window.getComputedStyle(popupBody);

    // Read the width and height
    let width = parseInt(popupStyle.width);
    let height = parseInt(popupStyle.height);

    // Add padding (left + right for width, top + bottom for height)
    width += parseInt(popupStyle.paddingLeft) + parseInt(popupStyle.paddingRight);
    height += parseInt(popupStyle.paddingTop) + parseInt(popupStyle.paddingBottom);

    // Add border (left + right for width, top + bottom for height)
    width += parseInt(popupStyle.borderLeftWidth) + parseInt(popupStyle.borderRightWidth);
    height += parseInt(popupStyle.borderTopWidth) + parseInt(popupStyle.borderBottomWidth);

    // Add a small buffer for any potential scrollbars or browser-specific elements
    const xbuffer = 17;
    const ybuffer = 39;
    width += xbuffer;
    height += ybuffer;

    // Resize the window
    window.resizeTo(width, height);
}

function showCustomAlert(message) {
    document.getElementById('alertMessage').textContent = message;
    document.getElementById('customAlert').style.display = 'block';
}

function closeCustomAlert() {
    document.getElementById('customAlert').style.display = 'none';
}