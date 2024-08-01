/* global chrome */

document.addEventListener('DOMContentLoaded', async () => {
    if (await acquireLock('activityList', 2)) { // Higher priority
        try {
            console.log(`array lock set in event listener.`);
            let {accountsWithNewActivity, lastNotificationTime, steemUsername} =
                    await chrome.storage.local.get(['accountsWithNewActivity', 'lastNotificationTime', 'steemUsername']);
            const currentCheckTime = new Date().toISOString();
            const accountsFromBackground = JSON.parse(accountsWithNewActivity || '[]');

            // Update HTML content with the previous notification time
            const previousNotificationTime = lastNotificationTime || 'Not available';

            const previousAlertTimeField = document.getElementById("previous-alert-time");
            if (previousAlertTimeField) {
                previousAlertTimeField.textContent = lastNotificationTime;
            }

            const steemUsernameField = document.getElementById("steemUsername");
            if (steemUsernameField) {
                steemUsernameField.textContent = steemUsername;
            }

            console.log(`Processing activity for ${steemUsername} after: ${lastNotificationTime}`);


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
//            const listValues = uniqueAccountsWithNewActivity.join(', ');

            const accountsList = document.getElementById('accountsList');

            /*
             // updateAccountsList() function is declared inside the document.addEventListener() context
             */
            async function updateAccountsList() {
                if (uniqueAccountsWithNewActivity.length === 0) {
                    /*
                     * activity list is empty.  Update HTML
                     */
                    const listItem = document.createElement('li');
                    listItem.textContent = 'No new activity detected.';
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
                        const lastDisplayTime = accountTriplet.lastDisplayTime;
                        const accountURL = `${webServerName}/@${account}`;

                        try {
                            console.log(`account: ${account}, startTime: ${lastDisplayTime}, api Endpoint: ${apiEndpoint} - before getAccountActivities`);
                            const {postList, commentList, replyList} = await getAccountActivities(account, lastDisplayTime, apiEndpoint);

                            // Create the HTML content for the account
                            let content = `<a href="${accountURL}" target="_blank">${account}</a><br>`;

                            if (postList.length > 0) {
                                content += `<strong>Posts:</strong><br><br><ul>`;
                                content += `<div class="indented-content">`; // Start of indented content
                                postList.forEach(post => {
                                    {
                                        let author, title, permlink, body, postTime;
                                        if (post && post[1] && post[1].op && Array.isArray(post[1].op) && post[1].op.length > 1 && post[1].op[1]) {
                                            const postData = post[1].op[1];
                                            author = postData.author || "Undefined author";
                                            title = postData.title || "Title missing";
                                            permlink = postData.permlink || "Permlink missing";
                                            body = postData.body || "Body is empty";
                                            postTime = post[1].timestamp || "Post time is empty";

                                            console.log("Post data:", {postTime, author, title, permlink, body: body.substring(0, 50) + "..."}); // Log truncated body for brevity
                                        } else {
                                            console.warn("Unexpected post structure:", post);
                                            author = "Unknown";
                                            title = "Unknown";
                                            permlink = "Unknown";
                                            body = "Unknown";
                                            postTime = "Unknown";
                                        }
                                        const plainBody = convertToPlainText(body);
                                        const bodySnippet = plainBody.length > 255 ? plainBody.substring(0, 255) + '...' : plainBody;

                                        content += `<li class="post-box">`; // Add 'post-box' class here
                                        content += `<strong>Author:</strong> ${author}<br>`;
                                        content += `<strong>Title:</strong> ${title}<br>`;
                                        content += `<strong>Date & Time:</strong> ${postTime}<br>`;
                                        content += `<strong>URL:</strong> <a href="${accountURL}/${permlink}" target="_blank">${accountURL}/${permlink}</a><br>`;
                                        content += `<strong>Body Snippet:</strong> ${bodySnippet}...`;
                                        content += `</li>`;
                                    }
                                });
                                content += `</ul>`;
                                content += `</div>`;  // End of indented content
                            } else {
                                content += `<strong>Posts:</strong><br><br>`;
                                content += `<div class="indented-content"><p>No posts found.</p></div>`;
                            }

                            content += `<br><br>`; // Add some spacing between sections

                            if (commentList.length > 0) {
                                content += `<strong>Comments:</strong><br><br><ul>`;
                                content += `<div class="indented-content">`; // Start of indented content
                                for (const comment of commentList) {
                                    let author = "Unknown";
                                    let parent_author = "Unknown";
                                    let parent_permlink = "Unknown";
                                    let root_author = "Unknown";
                                    let root_permlink = "Unknown";
                                    let root_title = "Unknown";
                                    let permlink = "Unknown";
                                    let body = "Unknown";
                                    let commentTime = "Unknown";

                                    if (comment && comment[1] && comment[1].op && Array.isArray(comment[1].op)
                                            && comment[1].op.length > 1 && comment[1].op[1]) {
                                        const commentData = comment[1].op[1];
                                        author = commentData.author || "Undefined author";
                                        parent_author = commentData.parent_author || "Parent author missing";
                                        parent_permlink = commentData.parent_permlink || "Parent permlink missing:";
                                        permlink = commentData.permlink || "Permlink missing";
                                        body = commentData.body || "Body is empty";
                                        commentTime = comment[1].timestamp || "commentTime is empty";
                                        const rootInfo = await getRootInfo(author, permlink, apiEndpoint);

                                        if (rootInfo) {
                                            ({root_author, root_permlink, root_title} = rootInfo);
                                        } else {
                                            root_author = "root_author missing";
                                            root_permlink = "root_permlink missing";
                                            root_title = "root_title missing";
                                        }
                                        console.log("Comment data:", {commentTime, author, permlink, body: body.substring(0, 50) + "..."}); // Log truncated body for brevity
                                    } else {
                                        console.warn(`Unexpected comment structure:", ${JSON.stringify(comment)}`);
                                    }

                                    const plainBody = convertToPlainText(body);
                                    const bodySnippet = plainBody.length > 255 ? plainBody.substring(0, 255) + '...' : plainBody;

                                    content += `<li class="post-box">`; // Add 'post-box' class here
                                    content += `<strong>Author:</strong> ${author}<br>`;
                                    content += `<strong>Date & Time:</strong> ${commentTime}<br>`;

                                    // All comments should have roots
                                    content += `<strong>Thread: </strong> <a href="${webServerName}/@${root_author}/${root_permlink}" target="_blank">${root_title}</a><br>`;

                                    // Check if parent and root links are different before adding parent
                                    if (parent_author !== root_author || parent_permlink !== root_permlink) {
                                        content += `<strong>Replying to:</strong> <a href="${webServerName}/@${parent_author}/${parent_permlink}" target="_blank">View Parent Post</a><br>`;
                                    }

                                                                        content += `<strong>Comment link:</strong> <a href="${accountURL}/${permlink}" target="_blank">${accountURL}/${permlink}</a><br>`;
                                    content += `<strong>Body Snippet:</strong> ${bodySnippet}...`;
                                    content += `</li>`;
                                }
                                ;
                                content += `</ul>`;
                                content += `</div>`;  // End of indented content
                            } else {
                                content += `<strong>Comments:</strong><br><br>`;
                                content += `<div class="indented-content"><p>No comments found.</p></div>`;
                            }

                            content += `<br><br>`; // Add some spacing between sections

                            if (replyList.length > 0) {
                                content += `<strong>Replies:</strong><br><br><ul>`;
                                content += `<div class="indented-content">`; // Start of indented content
                                for (const reply of replyList) {
                                    let author = "Unknown";
                                    let parent_author = "Unknown";
                                    let parent_permlink = "Unknown";
                                    let root_author = "Unknown";
                                    let root_permlink = "Unknown";
                                    let root_title = "Unknown";
                                    let permlink = "Unknown";
                                    let body = "Unknown";
                                    let replyTime = "Unknown";

                                    if (reply && reply[1] && reply[1].op && Array.isArray(reply[1].op)
                                            && reply[1].op.length > 1 && reply[1].op[1]) {
                                        const replyData = reply[1].op[1];
                                        author = replyData.author || "Undefined author";
                                        parent_author = replyData.parent_author || "Parent author missing";
                                        parent_permlink = replyData.parent_permlink || "Parent permlink missing:";
                                        permlink = replyData.permlink || "Permlink missing";
                                        body = replyData.body || "Body is empty";
                                        replyTime = reply[1].timestamp || "replyTime is empty";
                                        const rootInfo = await getRootInfo(author, permlink, apiEndpoint);

                                        if (rootInfo) {
                                            ({root_author, root_permlink, root_title} = rootInfo);
                                        } else {
                                            root_author = "root_author missing";
                                            root_permlink = "root_permlink missing";
                                            root_title = "root_title missing";
                                        }
                                        console.log("Reply data:", {replyTime, author, permlink, body: body.substring(0, 50) + "..."});
                                    } else {
                                        console.warn(`Unexpected reply structure:", ${JSON.stringify(comment)}`);
                                    }

                                    const plainBody = convertToPlainText(body);
                                    const bodySnippet = plainBody.length > 255 ? plainBody.substring(0, 255) + '...' : plainBody;

                                    content += `<li class="post-box">`; // Add 'post-box' class here
                                    content += `<strong>Author:</strong> ${author}<br>`;
                                    content += `<strong>Date & Time:</strong> ${replyTime}<br>`;

                                    // All replies should have roots
                                    content += `<strong>Thread: </strong> <a href="${webServerName}/@${root_author}/${root_permlink}" target="_blank">${root_title}</a><br>`;

                                    // Check if parent and root links are different before adding parent
                                    if (parent_author !== root_author || parent_permlink !== root_permlink) {
                                        content += `<strong>Replying to:</strong> <a href="${webServerName}/@${parent_author}/${parent_permlink}" target="_blank">View Parent Post</a><br>`;
                                    }

                                                                        content += `<strong>Reply link:</strong> <a href="${webServerName}/@${author}/${permlink}" target="_blank">${webServerName}/@${author}/${permlink}</a><br>`;
                                    content += `<strong>Body Snippet:</strong> ${bodySnippet}...`;
                                    content += `</li>`;
                                }
                                ;
                                content += `</ul>`;
                                content += `</div>`;  // End of indented content
                            } else {
                                content += `<strong>Replies:</strong><br><br>`;
                                content += `<div class="indented-content"><p>No replies found.</p></div>`;
                            }
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
                            accountTriplet.lastDisplayTime = lastActivityTime;
                            uniqueAccountsWithNewActivity[uniqueAccountIndex] = accountTriplet;
                        }
                        console.log("After checks: ");
                        showTriplet(accountTriplet);
                    }
                }
            }
            await updateAccountsList();

            // Save the stored account array and save the previousAlertTime to chrome.storage.local
            saveStoredAccountsWithNewActivity(uniqueAccountsWithNewActivity)
                    .then(() => {
                        console.log("Accounts with new activity successfully saved!");
                        console.dir(uniqueAccountsWithNewActivity);
                    })
                    .catch(error => {
                        console.error("Error clearing accounts:", error);
                    });

            await chrome.storage.local.set({lastNotificationTime: currentCheckTime});
            console.log(`Updated lastNotificationTime to: ${currentCheckTime}`);
        } finally {
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
        chrome.storage.local.set({'accountsWithNewActivity': JSON.stringify(uniqueAccountsWithNewActivity)}, function () {
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
            console.log(`Inside loop: start time: ${startTime}, transaction time: ${transactionTime}`);
            console.log(`Inside loop: start time stamp: ${startTimeStamp}, transaction time stamp: ${transactionTimeStamp}`);
        });

        console.log(`After loop: start time: ${startTime}, transaction time: ${transactionTime}`);
        console.log(`After loop: start time stamp: ${startTimeStamp}, transaction time stamp: ${transactionTimeStamp}`);

        transactionIndex--;
        lastActivity = await FetchAccountHistoryWithRetry(account, transactionIndex, apiEndpoint);
        console.log(JSON.stringify(lastActivity, null, 2));
        transactionTime = lastActivity.result[0][1].timestamp;
        transactionTimeStamp = new Date(`${transactionTime}Z`).getTime();
    }
    return {postList, commentList, replyList};
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
            headers: {"Content-Type": "application/json"}
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

function deleteTriplet(accounts, accountToDelete) {
//    console.debug(`Deleting ${accountToDelete} from saved accounts.`);
    return accounts.filter(item =>
        !(item.account === accountToDelete)
    );
}

function showTriplet(showAccount) {
    console.log(`Steem account: ${showAccount.account}`);
    console.log(`Last activity: ${showAccount.activityTime}`);
    console.log(`Last display: ${showAccount.lastDisplayTime}`);
}