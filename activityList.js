/* global chrome */

document.addEventListener('DOMContentLoaded', async () => {
    const currentCheckTime = new Date().toISOString();
    if (await acquireLock('activityList', 2)) { // Higher priority
        try {
            console.log(`array lock set in event listener.`);
            let { accountsWithNewActivity, lastActivityListPollTime, steemObserverName } =
                await chrome.storage.local.get(['accountsWithNewActivity', 'lastActivityListPollTime', 'steemObserverName']);
            // const accountsFromBackground = JSON.parse(accountsWithNewActivity || '[]');

            // Update HTML content with the previous notification time
            // const previousNotificationTime = lastActivityListPollTime || 'Not available';

            const previousAlertTimeField = document.getElementById("previous-alert-time");
            if (previousAlertTimeField) {
                previousAlertTimeField.textContent = lastActivityListPollTime;
            }

            const steemObserverNameField = document.getElementById("steemObserverName");
            if (steemObserverNameField) {
                steemObserverNameField.textContent = steemObserverName;
            }

            console.log(`Processing activity for ${steemObserverName} after: ${lastActivityListPollTime}`);


            // Remove duplicates using a Set and convert back to an Array
            console.log(`accountsWithNewAcitivty before splitting: ${accountsWithNewActivity}`);
            accountsWithNewActivity = JSON.parse(accountsWithNewActivity);   // Convert JSON string to array
            let uniqueAccountsWithNewActivity = Object.values(accountsWithNewActivity.reduce((activityRecord, item) => {
                if (!activityRecord[item.account]) {
                    // If this account hasn't been seen before, initialize it
                    activityRecord[item.account] = {
                        account: item.account,
                        activityTime: item.activityTime,
                        lastDisplayTime: item.lastDisplayTime
                    };
                } else {
                    // If we've seen this account before, update the times if necessary
                    activityRecord[item.account].activityTime =
                        newerDate(activityRecord[item.account].activityTime, item.activityTime);
                    activityRecord[item.account].lastDisplayTime =
                        newerDate(activityRecord[item.account].lastDisplayTime, item.lastDisplayTime);
                }
                return activityRecord;
            }, {}));
            const listSize = uniqueAccountsWithNewActivity.length;
            const accountsList = document.getElementById('accountsList');

            await updateAccountsList(uniqueAccountsWithNewActivity);

            // Save the stored account array and save the previousAlertTime to chrome.storage.local
            saveStoredAccountsWithNewActivity(uniqueAccountsWithNewActivity)
                .then(() => {
                    console.log("Accounts with new activity successfully saved!");
                    console.dir(uniqueAccountsWithNewActivity);
                })
                .catch(error => {
                    console.error("Error clearing accounts:", error);
                });
        } finally {
            await chrome.storage.local.set({ lastActivityListPollTime: currentCheckTime });
            console.log(`Updated lastActivityListPollTime to: ${currentCheckTime}`);
            await releaseLock("activityList");
            console.log(`array lock cleared in event listener.`);
        }
    } else {
        console.log(`Could not get array lock in activityList.`);
    }
    // After all data is loaded and the page is populated, change the background color
    document.body.style.backgroundColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--altBgColor').trim();

});

async function updateAccountsList(uniqueAccountsWithNewActivity) {
    if (uniqueAccountsWithNewActivity.length === 0) {
        /*
         * activity list is empty.  Update HTML
         */
        const listItem = document.createElement('li');
        // listItem.textContent = 'No new activity detected.';
        listItem.innerHTML = 'No new activity detected.';
        accountsList.appendChild(listItem);
    } else {
        /*
         * Some activity was observed.  Show it in HTML.
         */
        const apiEndpoint = await getApiServerName();

        for (const accountTriplet of uniqueAccountsWithNewActivity) {
            console.log(`Account: ${accountTriplet.account}`);
            console.log(`Newest Activity Time: ${new Date(accountTriplet.activityTime).toString()}`);
            console.log(`Newest Display Time: ${new Date(accountTriplet.lastDisplayTime).toString()}`);
            console.log('-------------------');
            console.log("Before checks: ");
            showTriplet(accountTriplet);

            await updateLock("activityList");
            const listItem = document.createElement('li');
            const webServerName = await getWebServerName();
            const account = accountTriplet.account;
            const lastActivityTime = accountTriplet.activityTime;
            const firstActivityTime = lastActivityTime;
            const lastDisplayTime = accountTriplet.lastDisplayTime;
            const accountURL = `${webServerName}/@${account}`;

            try {
                console.log(`account: ${account}, startTime: ${lastDisplayTime}, api Endpoint: ${apiEndpoint} - before getAccountActivities`);
                const { postList, commentList, replyList } = await getAccountActivities(account, lastDisplayTime, apiEndpoint);

                // Create the HTML content for the account
                // let content = `<a href="${accountURL}" target="_blank">${account}</a><br>`;
                // let content = `<a href="${accountURL}" target="_blank">${account}</a><br>`;

                console.debug("Entering processAllItems.");
                const content = await processAllItems(postList, commentList, replyList, account, apiEndpoint, webServerName, accountURL);
                console.debug("Exited processAllItems.");
                listItem.innerHTML = content;
            } catch (error) {
                console.warn(`Error fetching activities for account ${account}:`, error);
                listItem.textContent = `Error fetching activities for account ${account}`;
                continue;
            }

            accountsList.appendChild(listItem);
            const uniqueAccountIndex = uniqueAccountsWithNewActivity.findIndex(item => item.account === account);
            if (uniqueAccountIndex === -1) {
                // account not found in the list
                // this should never happen
            } else {
                accountTriplet.lastDisplayTime = firstActivityTime;
                uniqueAccountsWithNewActivity[uniqueAccountIndex] = accountTriplet;
            }
            console.log("After checks: ");
            showTriplet(accountTriplet);
        }
    }
}

function createContentItem(item, type, webServerName, accountURL, rootInfo) {
    let author, title, permlink, body, timestamp, parent_author, parent_permlink, root_author, root_permlink, root_title;

    if (item && item[1] && item[1].op && Array.isArray(item[1].op) && item[1].op.length > 1 && item[1].op[1]) {
        const itemData = item[1].op[1];
        author = itemData.author || "Undefined author";
        title = itemData.title || "Title missing";
        permlink = itemData.permlink || "Permlink missing";
        body = itemData.body || "Body is empty";
        timestamp = item[1].timestamp || "Timestamp is empty";
        parent_author = itemData.parent_author || "Parent author missing";
        parent_permlink = itemData.parent_permlink || "Parent permlink missing";
    } else {
        console.warn(`Unexpected ${type} structure:`, item);
        return `<li class="post-box">Error: Invalid ${type} data</li>`;
    }


    const plainBody = convertToPlainText(body);
    const bodySnippet = plainBody.length > 255 ? plainBody.substring(0, 255) + '...' : plainBody;

    let content = `<li class="post-box">`;

    if (type === 'post') {
        content += `<strong>Post: <A HREF="${accountURL}/${permlink}" target="_blank">${title}</a></strong><br>`;
    } else {
        // For comments and replies

        root_author = rootInfo.root_author;
        root_permlink = rootInfo.root_permlink;
        root_title = rootInfo.root_title;

        content += `<strong>Thread: </strong><a href="${webServerName}/@${root_author}/${root_permlink}" target="_blank">${root_title}</a><br>`;
        if (parent_author !== root_author || parent_permlink !== root_permlink) {
            // This is a nested reply
            content += `<strong>Reply to:</strong> <a href="${webServerName}/@${parent_author}/${parent_permlink}" target="_blank">/@${parent_author}/${parent_permlink}</a><br>`;
        }
    }

    content += `<strong>Author:</strong> <a href="${webServerName}/@${author}" target="_blank">${author}</a> / <strong>Date & Time:</strong> <a href="${webServerName}/@${author}/${permlink}" target="_blank">${timestamp}</a><br><br>`;
    content += `<strong>Body Snippet:</strong> ${bodySnippet}...`;
    content += `</li>`;

    console.log(`Returning from createContentItem: ${content}`);
    console.dir(content);
    return content;
}

async function processItems(items, type, apiEndpoint, webServerName, accountURL, permLink) {
    console.debug(`Entered processItems: ${type}`);
    let content;
    // if ( type !== "reply" ) {
    //    content = `<strong>${type.charAt(0).toUpperCase() + type.slice(1)}s:</strong><br><br><ul>`;
    // } else {
    //     content = "<strong>Replies:</strong><br><br><ul>";
    // }
    content = `<div class="indented-content">`;
    let rootInfo;

    for (const item of items) {
        console.debug(`Item: ${item}`);
        console.log("In processItems for loop.");
        console.debug(`author: ${item[1].op[1].author}, permlink: ${item[1].op[1].permlink}, api: ${apiEndpoint}`);
        console.dir(item);
        if (type !== 'post') {
            rootInfo = await getRootInfo(item[1].op[1].author, item[1].op[1].permlink, apiEndpoint);
            if (rootInfo) {
                console.log(`Got rootInfo: ${rootInfo}`);
                console.dir(rootInfo);
                item[1].op[1].root_author = rootInfo.root_author;
                item[1].op[1].root_permlink = rootInfo.root_permlink;
                item[1].op[1].root_title = rootInfo.root_title;
            } else {
                console.debug("Failed to retrieve rootInfo");
            }
        }
        content += createContentItem(item, type, webServerName, accountURL, rootInfo);
    }

    content += `</ul></div>`;
    console.debug(`Exiting processItems, type: ${type}, content: ${content}`);
    return content;
}

async function processAllItems(postList, commentList, replyList, account, apiEndpoint, webServerName, accountURL, permLink) {
    console.debug("Entered processAllItems");

    if ( postList.length === 0 && commentList.length === 0 && replyList.length === 0 ) {
        return "";
    }

    let content = `
        <details class="account-details">
            <summary class="account-summary"><a href="${webServerName}/@${account}" target="_blank">${account}</a></summary>
            <div class="account-content">
        `;

    if (postList.length > 0) {
        content += `
                <details class="content-details posts-details">
                    <summary class="content-summary"><a href="${webServerName}/@${account}/posts" target="_blank">Posts (${postList.length}</a>)</summary>
                    <div class="content-inner posts-content">
                        ${await processItems(postList, 'post', apiEndpoint, webServerName, accountURL, permLink)}
                    </div>
                </details>
            `;
    }

    if (commentList.length > 0) {
        content += `
                <details class="content-details comments-details">
                    <summary class="content-summary"><a href="${webServerName}/@${account}/comments" target="_blank">Comments (${commentList.length}</a>)</summary>
                    <div class="content-inner comments-content">
                        ${await processItems(commentList, 'comment', apiEndpoint, webServerName, accountURL, permLink)}
                    </div>
                </details>
            `;
    }

    if (replyList.length > 0) {
        content += `
                <details class="content-details replies-details">
                    <summary class="content-summary"><a href="${webServerName}/@${account}/replies" target="_blank">Replies (${replyList.length}</a>)</summary>
                    <div class="content-inner replies-content">
                        ${await processItems(replyList, 'reply', apiEndpoint, webServerName, accountURL, permLink)}
                    </div>
                </details>
            `;
    }

    content += `
            </div>
        </details>
        `;

    console.debug(`Exiting processAllItems: ${content}`);
    return content;
}


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

function convertToPlainText(html) {
    // Create a temporary DOM element
    const temp = document.createElement('div');

    // Set the HTML content
    temp.innerHTML = html;

    // Get the text content
    let text = temp.textContent || temp.innerText || '';

    // Remove markdown image syntax
    text = text.replace(/\[!\[.*?\]\(.*?\)\]/g, '');  // Remove nested image markdown
    text = text.replace(/!\[.*?\]\(.*?\)/g, '');      // Remove regular image markdown

    // Remove markdown link syntax
    text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

    // Remove other common markdown syntax
    text = text.replace(/[#*_~`]/g, '');

    return text.trim();
}

// Function to clear stored accountsWithNewActivity in chrome.storage.local
async function saveStoredAccountsWithNewActivity(uniqueAccountsWithNewActivity) {
    return new Promise((resolve, reject) => {
        console.log("Inside: saveStoredAccountsWithNewActivity");
        chrome.storage.local.set({ 'accountsWithNewActivity': JSON.stringify(uniqueAccountsWithNewActivity) }, function () {
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
    let allActivities = [];  // Initialize an empty array to store activities
    let postList = [];    // Initialize list of posts
    let commentList = []; // Initialize list of comments
    let replyList = [];   // Initialize list of replies

    async function FetchAccountHistoryWithRetry(account, index, apiEndpoint, retries = 5) {
        while (retries > 0) {
            try {
                const response = await fetch(apiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
                    if (jsonResponse.error.code === -32801 || jsonResponse.error.code === -32603) {
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
    console.log(`Before loop: start time: ${startTime}, transaction time: ${transactionTime}`);
    console.log(`Before loop: start time stamp: ${startTimeStamp}, transaction time stamp: ${transactionTimeStamp}`);

    while (startTimeStamp < transactionTimeStamp) {
        console.log(`looking for transactions in ${account} account  history.`);
        if (!lastActivity.result) {
            console.log(`downloading transaction failed for ${account}.  Skipping.`);
            continue;
        }
        lastActivity.result.forEach(activity => {
            allActivities.push(activity);  // Add the entire activity object to the array

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
            console.log("Processed");
            // console.log(`Inside loop: start time: ${startTime}, transaction time: ${transactionTime}`);
            // console.log(`Inside loop: start time stamp: ${startTimeStamp}, transaction time stamp: ${transactionTimeStamp}`);
        });

        console.log(`After loop: start time: ${startTime}, transaction time: ${transactionTime}`);
        console.log(`After loop: start time stamp: ${startTimeStamp}, transaction time stamp: ${transactionTimeStamp}`);

        transactionIndex--;
        lastActivity = await FetchAccountHistoryWithRetry(account, transactionIndex, apiEndpoint);
        console.log(JSON.stringify(lastActivity, null, 2));
        transactionTime = lastActivity.result[0][1].timestamp;
        transactionTimeStamp = new Date(`${transactionTime}Z`).getTime();
    }
    return { postList, commentList, replyList };
}

async function getRootInfo(author, permlink, apiEndpoint) {
    const url = apiEndpoint;
    const data = JSON.stringify({
        jsonrpc: "2.0",
        method: "condenser_api.get_content",
        params: [author, permlink],
        id: 1
    });

    try {
        const response = await fetch(url, {
            method: "POST",
            body: data,
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) {
            throw new Error(`Error fetching content: ${response.status}`);
        }

        const jsonData = await response.json();
        const content = jsonData.result;
        return {
            root_author: content.root_author,
            root_permlink: content.root_permlink,
            root_title: content.root_title
        };
    } catch (error) {
        console.error("Error:", error);
        return null; // Or handle the error differently
    }
}

function newerDate(date1, date2) {
    return new Date(date1) > new Date(date2) ? date1 : date2;
}

function showTriplet(showAccount) {
    console.log(`Steem account: ${showAccount.account}`);
    console.log(`Last activity: ${showAccount.activityTime}`);
    console.log(`Last display: ${showAccount.lastDisplayTime}`);
}