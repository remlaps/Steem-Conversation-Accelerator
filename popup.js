document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('saveButton');
    const pollingTimeInput = document.getElementById('pollingTime');
    const steemObserverNameInput = document.getElementById('steemObserverName');
    const apiServerNameSelect = document.getElementById('apiServerName');
    const webServerNameSelect = document.getElementById('webServerName');
    const addTagButton = document.getElementById('addTagButton');
    const newTagInput = document.getElementById('newTag');
    const tagsDropdown = document.getElementById('tagsDropdown');
    const deleteTopTagButton = document.getElementById('deleteTopTagButton');

    // Load tags from chrome.storage.local
    chrome.storage.local.get(['tags'], (result) => {
        const savedTags = result.tags || [];
        savedTags.forEach(tag => addTagToDropdown(tag));
    });

    addTagButton.addEventListener('click', function() {
        const tag = newTagInput.value.trim();
        if (tag) {
            addTagToDropdown(tag);
            saveTags();
            newTagInput.value = '';
        }
    });

    deleteTopTagButton.addEventListener('click', function() {
        if (tagsDropdown.selectedIndex !== -1) {
            tagsDropdown.remove(tagsDropdown.selectedIndex);
            saveTags();
        }
    });

    function addTagToDropdown(tag) {
        const existingTag = Array.from(tagsDropdown.options).find(option => option.value === tag);
        if (!existingTag) {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = tag;
            tagsDropdown.appendChild(option);
        }
    }

    function saveTags() {
        const tags = Array.from(tagsDropdown.options).map(option => option.value);
        chrome.storage.local.set({ tags: tags }, () => {
            console.log("Tags saved");
        });
    }

    saveButton.addEventListener('click', () => {
        const pollingTime = pollingTimeInput.value;
        const steemObserverName = steemObserverNameInput.value;
        const apiServerName = apiServerNameSelect.value;
        const webServerName = webServerNameSelect.value;
        const tags = Array.from(tagsDropdown.options).map(option => option.value);

        console.debug(`In document: steemObserverName - ${steemObserverName}`);
        getSteemAccountName(steemObserverName, apiServerName)
        .then(accountName => {
            console.debug(`Steem Observer Account: ${accountName}`);
            if (accountName === steemObserverName) {
                chrome.storage.local.set({
                    pollingTime: parseInt(pollingTime, 10),
                    steemObserverName: accountName,
                    apiServerName: apiServerName,
                    webServerName: webServerName,
                    tags: tags
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
        resizeWindow();

        const customAlertOkButton = document.getElementById('customAlertOkButton');
        customAlertOkButton.addEventListener('click', closeCustomAlert);

        async function displayActivityInfo() {
            const [lockInfo, nextPollTime] = await Promise.all([checkLockSync(), getNextPollingTime()]);
            if (lockInfo) {
                lockOwner = lockInfo.owner;
                lockTime = lockInfo.lockedAt;

                document.getElementById('lockStatusText').textContent = `${lockOwner}`;
                document.getElementById('lockStatusTime').textContent = new Date(lockTime).toLocaleString();
            } else {
                document.getElementById('lockStatusText').textContent = 'Paused';
                document.getElementById('lockStatusTime').textContent = '-';
            }
            document.getElementById('nextPollTime').textContent = nextPollTime ? nextPollTime.toLocaleString() : '-';
            console.log(`Next alarm time: ${nextPollTime}`);
        }; displayActivityInfo();

        let intervalId = setInterval(displayActivityInfo, 15000);

        window.addEventListener('beforeunload', () => {
            clearInterval(intervalId);
        });

        chrome.storage.local.get(['pollingTime', 'steemObserverName', 'apiServerName', 'webServerName', 'tags'], (result) => {
            if (result.pollingTime) {
                pollingTimeInput.value = result.pollingTime;
            }
            if (result.steemObserverName) {
                steemObserverNameInput.value = result.steemObserverName;
            }
            if (result.apiServerName) {
                apiServerNameSelect.value = result.apiServerName;
            }
            if (result.webServerName) {
                webServerNameSelect.value = result.webServerName;
            }
            if (result.tags) {
                result.tags.forEach(tag => addTagToDropdown(tag));
            }
        });
    };

    function resizeWindow() {
        const popupBody = document.querySelector('.popup-settings-body');

        if (!popupBody) {
            console.error('Element with class .popup-settings-body not found');
            return;
        }

        const popupStyle = window.getComputedStyle(popupBody);

        let width = parseInt(popupStyle.width);
        let height = parseInt(popupStyle.height);

        width += parseInt(popupStyle.paddingLeft) + parseInt(popupStyle.paddingRight);
        height += parseInt(popupStyle.paddingTop) + parseInt(popupStyle.paddingBottom);

        width += parseInt(popupStyle.borderLeftWidth) + parseInt(popupStyle.borderRightWidth);
        height += parseInt(popupStyle.borderTopWidth) + parseInt(popupStyle.borderBottomWidth);

        const xbuffer = 17;
        const ybuffer = 39;
        width += xbuffer;
        height += ybuffer;

        window.resizeTo(width, height);
    }

    function showCustomAlert(message) {
        document.getElementById('alertMessage').textContent = message;
        document.getElementById('customAlert').style.display = 'block';
    }

    function closeCustomAlert() {
        document.getElementById('customAlert').style.display = 'none';
    }
});
