/* global chrome */

document.addEventListener('DOMContentLoaded', async () => {
    const {accountsWithNewActivity, currentCheckTime, lastNotificationTime} =
            await chrome.storage.local.get(['accountsWithNewActivity', 'currentCheckTime', 'lastNotificationTime']);
    const accounts = JSON.parse(accountsWithNewActivity || '[]');

    // Update HTML content with the previous notification time
    const previousNotificationTime = lastNotificationTime || 'Not available';
    console.log(`Processing activity after: ${lastNotificationTime}`);

    const previousAlertTimeField = document.getElementById("previous-alert-time");
    if (previousAlertTimeField) {
        previousAlertTimeField.textContent = lastNotificationTime;
    }

    // Remove duplicates using a Set and convert back to an Array
    const uniqueAccountsWithNewActivity = [...new Set(accounts)];
    const listSize = uniqueAccountsWithNewActivity.length;
    const listValues = uniqueAccountsWithNewActivity.join(', ');
    console.log(`Accounts with new activity: ${listValues}, size: ${listSize}`);

    const accountsList = document.getElementById('accountsList');
    async function updateAccountsList() {
        if (uniqueAccountsWithNewActivity.length === 0) {
            const listItem = document.createElement('li');
            listItem.textContent = 'No new activity detected.';
            accountsList.appendChild(listItem);
        } else {
            const apiEndpoint = await getApiServerName();

            for (const account of uniqueAccountsWithNewActivity) {
                const listItem = document.createElement('li');
                const webServerName = await getWebServerName();
                const accountURL = `${webServerName}/@${account}`;

                try {
                    console.log(`account: ${account}, startTime: ${previousNotificationTime}, api Endpoint: ${apiEndpoint} - before getAccountActivities`);
                    const {postList, commentList, replyList} = await getAccountActivities(account, previousNotificationTime, apiEndpoint);

                    // Create the HTML content for the account
                    let content = `<a href="${accountURL}" target="_blank">${account}</a><br>`;

                    if (postList.length > 0) {
                        content += `<strong>Posts:</strong><ul>`;
                        postList.forEach(post => {
                            content += `<li>${JSON.stringify(post)}</li>`;
                        });
                        content += `</ul>`;
                    } else {
                        content += `<strong>Posts:</strong><p>No posts found.</p>`;
                    }

                    if (commentList.length > 0) {
                        content += `<strong>Comments:</strong><ul>`;
                        commentList.forEach(comment => {
                            content += `<li>${JSON.stringify(comment)}</li>`;
                        });
                        content += `</ul>`;
                    } else {
                        content += `<strong>Comments:</strong><p>No comments found.</p>`;
                    }

                    if (replyList.length > 0) {
                        content += `<strong>Replies:</strong><ul>`;
                        replyList.forEach(reply => {
                            content += `<li>${JSON.stringify(reply)}</li>`;
                        });
                        content += `</ul>`;
                    } else {
                        content += `<strong>Replies:</strong><p>No replies found.</p>`;
                    }
                    listItem.innerHTML = content;
                } catch (error) {
                    console.error(`Error fetching activities for account ${account}:`, error);
                    listItem.textContent = `Error fetching activities for account ${account}`;
                }

                accountsList.appendChild(listItem);
            }
        }
    }

    await updateAccountsList();

    // Clear the stored account array and save the previousAlertTime to chrome.storage.local
    await clearStoredAccountsWithNewActivity();
    await chrome.storage.local.set({lastNotificationTime: currentCheckTime});

    console.log(`Updated lastNotificationTime to: ${currentCheckTime}`);
    console.log('accountsWithNewActivity has been reset.');
});

// Function to retrieve stored accountsWithNewActivity from chrome.storage.local
async function getStoredAccountsWithNewActivity() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get('accountsWithNewActivity', function (result) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result.accountsWithNewActivity);
            }
        });
    });
}

// Function to clear stored accountsWithNewActivity in chrome.storage.local
async function clearStoredAccountsWithNewActivity() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({'accountsWithNewActivity': JSON.stringify([])}, function () {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
}

async function getAccountActivities(account, startTime, apiEndpoint) {
    const startTimeStamp = new Date(startTime).getTime();

    let activities = [];  // Initialize an empty array to store activities
    let postList = [];    // Initialize list of posts
    let commentList = []; // Initialize list of comments
    let replyList = [];   // Initialize list of replies

    async function FetchAccountHistoryWithRetry(account, index, apiEndpoint, retries = 5) {
        while (retries > 0) {
            try {
                const response = await fetch(apiEndpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "condenser_api.get_account_history",
                        params: [account, index, 0],
                        id: 1
                    })
                });

                jsonResponse = await response.json();
//                console.dir(jsonResponse); // View parsed JSON data
                if (jsonResponse.error) {
                    if (jsonResponse.error.code === -32801) {
                        retries--;
                        console.log("Rate limit encountered.");
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        return jsonResponse;
                    }
                } else {
                    return jsonResponse;
                }
            } catch (error) {
                retries--;
                console.dir(error);
                console.warn(`Try/catch error while fetching account history, retrying in 1 second. Attempts remaining: ${retries}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        throw new Error('Failed to fetch account history after all retries');
    }

    let lastActivity = await FetchAccountHistoryWithRetry(account, -1, apiEndpoint);
    // console.log(JSON.stringify(lastActivity, null, 2));
    let transactionIndex = lastActivity.result[0][0];
    let transactionTime = lastActivity.result[0][1].timestamp;
    let transactionTimeStamp = new Date(transactionTime + 'Z').getTime();
    console.log(`start time: ${startTime}, transaction time stamp: ${transactionTime}`);
    console.log(`start time stamp: ${startTimeStamp}, transaction time: ${transactionTimeStamp}`);

    while (startTimeStamp < transactionTimeStamp) {
        console.log(`looking for transactions in ${account} account  history.`);
        if (!lastActivity.result) {
            console.log(`downloading transaction failed for ${account}.  Skipping.`);
            continue;
        }
        lastActivity.result.forEach(activity => {
            activities.push(activity);  // Add the entire activity object to the array

            if (startTimeStamp < transactionTimeStamp) {
                let steemOp = activity[1]?.op?.[0];
                console.log(`Steem operation: ${steemOp}`);
                if (steemOp === "comment") {
                    let parentAuthor = activity[1].op[1].parent_author;
                    if (!parentAuthor) {
                        postList.push(activity);
                    } else {
                        let author = activity[1].op[1].author;
                        if (author === account) {
                            commentList.push(activity);
                        } else {
                            replyList.push(activity);
                        }
                    }
                }
            }
        });

        console.log(`Transaction index: ${transactionIndex}`);
        console.log(`start time: ${startTime}, transaction time: ${transactionTime}`);
        console.log(`start time stamp: ${startTimeStamp}, transaction time stamp: ${transactionTimeStamp}`);
        transactionIndex--;
        lastActivity = await FetchAccountHistoryWithRetry(account, transactionIndex, apiEndpoint);
//        console.log(JSON.stringify(lastActivity, null, 2));
        transactionTime = lastActivity.result[0][1].timestamp;
        transactionTimeStamp = new Date(transactionTime + 'Z').getTime();
    }

    return {postList, commentList, replyList};
}
