/* global chrome */

document.addEventListener('DOMContentLoaded', async () => {
    if (await acquireLock('activityList', 2)) { // Higher priority
        try {
            console.log(`array lock set in event listener.`);
            const {accountsWithNewActivity, lastNotificationTime, steemUsername} =
                    await chrome.storage.local.get(['accountsWithNewActivity', 'lastNotificationTime', 'steemUsername']);
            const currentCheckTime = new Date().toISOString();
            const accountsFromBackground = JSON.parse(accountsWithNewActivity || '[]');
            const steemFollowedActiveAccounts = accountsFromBackground.map(item => item.account);

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
            const uniqueAccountsWithNewActivity = [...new Set(steemFollowedActiveAccounts)];
            const listSize = uniqueAccountsWithNewActivity.length;
            const listValues = uniqueAccountsWithNewActivity.join(', ');

            const accountsList = document.getElementById('accountsList');
            async function updateAccountsList() {

                //
                // Duplicate accounts that accumulated over multiple iterations must be eliminated
                //
                if (uniqueAccountsWithNewActivity.length === 0) {
                    const listItem = document.createElement('li');
                    listItem.textContent = 'No new activity detected.';
                    accountsList.appendChild(listItem);
                } else {
                    const apiEndpoint = await getApiServerName();

                    for (const account of uniqueAccountsWithNewActivity) {
                        await updateLock("activityList");
                        const listItem = document.createElement('li');
                        const webServerName = await getWebServerName();
                        const accountURL = `${webServerName}/@${account}`;

                        try {
                            console.log(`account: ${account}, startTime: ${previousNotificationTime}, api Endpoint: ${apiEndpoint} - before getAccountActivities`);
                            const {postList, commentList, replyList} = await getAccountActivities(account, previousNotificationTime, apiEndpoint);

                            // Create the HTML content for the account
                            let content = `<a href="${accountURL}" target="_blank">${account}</a><br>`;

                            if (postList.length > 0) {
                                content += `<strong>Posts:</strong><br><br><ul>`;
                                postList.forEach(post => {
                                    {
                                        let author, title, permlink, body;
                                        if (post && post[1] && post[1].op && Array.isArray(post[1].op) && post[1].op.length > 1 && post[1].op[1]) {
                                            const postData = post[1].op[1];
                                            author = postData.author || "Undefined author";
                                            title = postData.title || "Title missing";
                                            permlink = postData.permlink || "Permlink missing";
                                            body = postData.body || "Body is empty";

                                            console.log("Post data:", {author, title, permlink, body: body.substring(0, 50) + "..."}); // Log truncated body for brevity
                                        } else {
                                            console.warn("Unexpected post structure:", post);
                                            author = "Unknown";
                                            title = "Unknown";
                                            permlink = "Unknown";
                                            body = "Unknown";
                                        }
                                        const bodySnippet = body.length > 255 ? body.substring(0, 255) + '...' : body;

                                        content += `<li>`;
                                        content += `<strong>Author:</strong> ${author}<br>`;
                                        content += `<strong>Title:</strong> ${title}<br>`;
                                        content += `<strong>Permlink:</strong> ${permlink} <br>`;
                                        content += `<strong>URL:</strong> <a href="${accountURL}/${permlink}" target="_blank">${accountURL}/${permlink}</a><br>`;
                                        content += `<strong>Body Snippet:</strong> ${bodySnippet}...`;
                                        content += `</li>`;
                                    }
                                });
                                content += `</ul>`;
                            } else {
                                content += `<strong>Posts:</strong><p>No posts found.</p>`;
                            }

                            if (commentList.length > 0) {
                                content += `<strong>Comments:</strong><br><br><ul>`;
                                for (const comment of commentList) {
                                    let author = "Unknown";
                                    let parent_author = "Unknown";
                                    let parent_permlink = "Unknown";
                                    let root_author = "Unknown";
                                    let root_permlink = "Unknown";
                                    let root_title = "Unknown";
                                    let permlink = "Unknown";
                                    let body = "Unknown";

                                    if (comment && comment[1] && comment[1].op && Array.isArray(comment[1].op)
                                            && comment[1].op.length > 1 && comment[1].op[1]) {
                                        const commentData = comment[1].op[1];
                                        author = commentData.author || "Undefined author";
                                        parent_author = commentData.parent_author || "Parent author missing";
                                        parent_permlink = commentData.parent_permlink || "Parent permlink missing:";
                                        permlink = commentData.permlink || "Permlink missing";
                                        body = commentData.body || "Body is empty";
                                        const rootInfo = await getRootInfo(author, permlink, apiEndpoint);

                                        if (rootInfo) {
                                            ({root_author, root_permlink, root_title} = rootInfo);
                                        } else {
                                            root_author = "root_author missing";
                                            root_permlink = "root_permlink missing";
                                            root_title = "root_title missing";
                                        }
                                        console.log("Comment data:", {author, permlink, body: body.substring(0, 50) + "..."}); // Log truncated body for brevity
                                    } else {
                                        console.warn(`Unexpected comment structure:", ${JSON.stringify(comment)}`);
                                    }

                                    const bodySnippet = body.length > 255 ? body.substring(0, 255) + '...' : body;

                                    content += `<li>`;
                                    content += `<strong>Author:</strong> ${author}<br>`;
                                    content += `<strong>Permlink:</strong> ${permlink} <br>`;

                                    // All comments should have roots
                                    content += `<strong>Thread: </strong> <a href="${webServerName}/@${root_author}/${root_permlink}" target="_blank">${root_title}</a><br>`;
                                    
                                    // Check if parent and root links are different before adding parent
                                    if (parent_author !== root_author || parent_permlink !== root_permlink) {
                                        content += `<strong>Replying to:</strong> <a href="${webServerName}/@${parent_author}/${parent_permlink}" target="_blank">View Parent Post</a><br>`;
                                    }

                                    content += `<strong>Comment link:</strong> <a href="${accountURL}/${permlink}" target="_blank">${accountURL}/${permlink}</a><br>`;
                                    content += `<strong>Body Snippet:</strong> ${bodySnippet}...`;
                                    content += `</li>`;
                                };
                                content += `</ul>`;
                            } else {
                                content += `<strong>Comments:</strong><p>No comments found.</p>`;
                            }

                            if (replyList.length > 0) {
                                content += `<strong>Comments:</strong><br><br><ul>`;
                                for (const reply of replyList) {
                                    let author = "Unknown";
                                    let parent_author = "Unknown";
                                    let parent_permlink = "Unknown";
                                    let root_author = "Unknown";
                                    let root_permlink = "Unknown";
                                    let root_title = "Unknown";
                                    let permlink = "Unknown";
                                    let body = "Unknown";

                                    if (reply && reply[1] && reply[1].op && Array.isArray(reply[1].op)
                                            && reply[1].op.length > 1 && reply[1].op[1]) {
                                        const replyData = reply[1].op[1];
                                        author = replyData.author || "Undefined author";
                                        parent_author = replyData.parent_author || "Parent author missing";
                                        parent_permlink = replyData.parent_permlink || "Parent permlink missing:";
                                        permlink = replyData.permlink || "Permlink missing";
                                        body = replyData.body || "Body is empty";
                                        const rootInfo = await getRootInfo(author, permlink, apiEndpoint);

                                        if (rootInfo) {
                                            ({root_author, root_permlink, root_title} = rootInfo);
                                        } else {
                                            root_author = "root_author missing";
                                            root_permlink = "root_permlink missing";
                                            root_title = "root_title missing";
                                        }
                                        console.log("Reply data:", {author, permlink, body: body.substring(0, 50) + "..."}); // Log truncated body for brevity
                                    } else {
                                        console.warn(`Unexpected reply structure:", ${JSON.stringify(comment)}`);
                                    }

                                    const bodySnippet = body.length > 255 ? body.substring(0, 255) + '...' : body;

                                    content += `<li>`;
                                    content += `<strong>Author:</strong> ${author}<br>`;
                                    content += `<strong>Permlink:</strong> ${permlink} <br>`;

                                    // All comments should have roots
                                    content += `<strong>Thread: </strong> <a href="${webServerName}/@${root_author}/${root_permlink}" target="_blank">${root_title}</a><br>`;
                                    
                                    // Check if parent and root links are different before adding parent
                                    if (parent_author !== root_author || parent_permlink !== root_permlink) {
                                        content += `<strong>Replying to:</strong> <a href="${webServerName}/@${parent_author}/${parent_permlink}" target="_blank">View Parent Post</a><br>`;
                                    }

                                    content += `<strong>Reply link:</strong> <a href="${accountURL}/${permlink}" target="_blank">${accountURL}/${permlink}</a><br>`;
                                    content += `<strong>Body Snippet:</strong> ${bodySnippet}...`;
                                    content += `</li>`;
                                };
                                content += `</ul>`;
                            } else {
                                content += `<strong>Replies:</strong><p>No replies found.</p>`;
                            }
                            listItem.innerHTML = content;
                        } catch (error) {
                            console.warn(`Error fetching activities for account ${account}:`, error);
                            listItem.textContent = `Error fetching activities for account ${account}`;
                            continue;
                        }

                        accountsList.appendChild(listItem);
                    }
                }
            }

            await updateAccountsList();

            // Clear the stored account array and save the previousAlertTime to chrome.storage.local
            clearStoredAccountsWithNewActivity()
                    .then(() => {
                        console.log("Accounts with new activity successfully cleared!");
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
        console.log("Inside: clearStoredAccountsWithNewActivity");
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

async function getRootInfo(author, permlink, apiEndpoint) {
  const url = apiEndpoint;
  const data = JSON.stringify({
    jsonrpc: "2.0",
    method: "condenser_api.get_content",
    params: [author, permlink],
    id: 1,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      body: data,
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Error fetching content: ${response.status}`);
    }

    const jsonData = await response.json();
    const content = jsonData.result;
    return {
      root_author: content.root_author,
      root_permlink: content.root_permlink,
      root_title: content.root_title,
    };
  } catch (error) {
    console.error("Error:", error);
    return null; // Or handle the error differently
  }
}