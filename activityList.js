/* global chrome */

document.addEventListener('DOMContentLoaded', async () => {
    const thisActivityPageViewTime = new Date().toISOString();
    if (await acquireLock('activityList', 2)) { // Higher priority
        try {
            console.log(`array lock set in event listener.`);
            let { accountsWithNewActivity, steemObserverName, lastActivityPageViewTime } =
                await chrome.storage.local.get(['accountsWithNewActivity', 'steemObserverName', 'lastActivityPageViewTime', 'lastActivityPageViewTime']);

            /*
             *  Set the steem observer account and display it.
            */
            const steemObserverNameField = document.getElementById("steemObserverName");
            if (steemObserverNameField) {
                steemObserverNameField.textContent = steemObserverName;
            }

            // console.log(`Processing activity for ${steemObserverName} after: ${thisActivityPageViewTime}`);

            /*
             * Display the last displayed time.
             */
            const previousAlertTimeField = document.getElementById("previous-alert-time");
            if (previousAlertTimeField) {
                previousAlertTimeField.textContent = lastActivityPageViewTime;
            }

            let uniqueAccountsWithNewActivity = filterUniqueAccounts(accountsWithNewActivity);
            uniqueAccountsWithNewActivity = await updateAccountsList(uniqueAccountsWithNewActivity);

            // Save the stored account array and save the previousAlertTime to chrome.storage.local
            saveStoredAccountsWithNewActivity(uniqueAccountsWithNewActivity)
                .then(() => {
                    console.log("Accounts with new activity successfully saved!");
                    console.dir(uniqueAccountsWithNewActivity);
                })
                .catch(error => {
                    console.warn("Error clearing accounts:", error);
                });
        } finally {
            await chrome.storage.local.set({
                'lastActivityPageViewTime': thisActivityPageViewTime,
                'lastCheckedIndex': 0
            });
            console.log(`Updated lastActivityPageViewTime to: ${thisActivityPageViewTime}`);
            await releaseLock("activityList");
            console.log(`array lock cleared in event listener.`);
        }
    } else {
        console.log(`Could not get array lock in activityList.`);
    }
    deleteDuplicateTable();
    // After all data is loaded and the page is populated, change the background color
    document.body.style.backgroundColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--altBgColor').trim();

}); // End of document.addEventListener()

/*
 * Create the HTML for the posts, replies, and comments.
 */
async function updateAccountsList(uniqueAccountsWithNewActivity) {
    if (uniqueAccountsWithNewActivity.length === 0) {
        accountsList.innerHTML = '<li>No new activity detected.</li>';
        return;
    }

    const apiEndpoint = await getApiServerName();
    const webServerName = await getWebServerName();

    for (const followedAccountObj of uniqueAccountsWithNewActivity) {
        let lastActivity;
        console.log(`Processing account: ${followedAccountObj.account}`);
        
        await updateLock("activityList");
        const listItem = document.createElement('li');
        const accountURL = `${webServerName}/@${followedAccountObj.account}`;
        let activities = {
            postList: [],
            commentList: [],
            replyList: []
          };

        try {
            console.debug(`Account: ${followedAccountObj.account}, Display string: ${followedAccountObj.lastDisplayTime}, 
                last display time: ${followedAccountObj.activityTime}`);

            // Account history checks are time consuming.  Only check accounts that were flagged during background polling.
            // This means that some accounts with updates might not display until after the next polling cycle.
            if ( new Date (followedAccountObj.lastDisplayTime ) < new Date ( followedAccountObj.activityTime ) ) {
                console.debug(`Going deeper for ${followedAccountObj.account}`);
                activities = await getAccountActivities(followedAccountObj.account, followedAccountObj.lastDisplayTime, apiEndpoint);
                const content = await processAllItems(...Object.values(activities), followedAccountObj.account, apiEndpoint, webServerName,
                    accountURL, followedAccountObj.lastDisplayTime);
                listItem.innerHTML = content;
            }
            if ( isEmptyActivityList(activities) ) {
                lastActivity = new Date ( `${followedAccountObj.activityTime}` );
            } else {
                lastActivity = getLastActivityTimeFromAll (activities);
            }
        } catch (error) {
            console.warn(`Error fetching activities for account ${followedAccountObj.account}:`, error);
            // listItem.textContent = `Error fetching activities for account ${followedAccountObj.account}`;
            continue;
        }

        accountsList.appendChild(listItem);
        uniqueAccountsWithNewActivity = updateLastDisplayTime(uniqueAccountsWithNewActivity, followedAccountObj.account, lastActivity);
    }
    return uniqueAccountsWithNewActivity;
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

    const plainBody = body.startsWith("@@") ? "[content edited]" : convertToPlainText(body);
    const bodySnippet = plainBody.length > 255 ? plainBody.substring(0, 255) + '...' : plainBody;
    
    let content = `<li class="post-box">`;

    content += `<strong>Author:</strong> <a href="${webServerName}/@${author}" target="_blank">${author}</a> / <strong>Date & Time:</strong> <a href="${webServerName}/@${author}/${permlink}" target="_blank">${timestamp}</a><br>`;
    if (type === 'post') {
        content += `<strong>Post: <A HREF="${accountURL}/${permlink}" target="_blank">${title}</a></strong>`;
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

    content += '<br><br>';
    content += `<strong>Body Snippet:</strong> ${bodySnippet}...`;
    content += '<br>';
    content += `</li>`;

    // console.log(`Returning from createContentItem: ${content}`);
    // console.dir(content);
    return content;
}

async function processItems(items, type, apiEndpoint, webServerName, accountURL) {
    console.debug(`Entered processItems: ${type}`);
    let content;
    content = `<div class="indented-content">`;
    let rootInfo;

    for (const item of items) {
        // console.debug(`Item: ${item}`);
        // console.log("In processItems for loop.");
        console.debug(`timestamp: ${item[1].timestamp}, author: ${item[1].op[1].author}, permlink: ${item[1].op[1].permlink}, api: ${apiEndpoint}`);
        // console.dir(item);
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
    // console.debug(`Exiting processItems, type: ${type}, content: ${content}`);
    console.debug(`Exiting processItems, type: ${type}`);
    return content;
}

async function processAllItems(postList, commentList, replyList, account, apiEndpoint, webServerName, accountURL, lastDisplayTime) {
    if (postList.length === 0 && commentList.length === 0 && replyList.length === 0) {
        return "";
    }

    let content = `
        <details class="account-details" open>
            <summary class="account-summary"><strong><a href="${webServerName}/@${account}" target="_blank">${account}</a></strong>: Activity after ${lastDisplayTime}</summary>
            <div class="account-content">
        `;

    content += await generateContentSection(postList, 'post', webServerName, account, apiEndpoint, accountURL);
    content += await generateContentSection(commentList, 'comment', webServerName, account, apiEndpoint, accountURL);
    content += await generateContentSection(replyList, 'reply', webServerName, account, apiEndpoint, accountURL);

    content += `
            </div>
        </details>
        `;

    // console.debug(`Exiting processAllItems: ${content}`);
    return content;
}

async function generateContentSection(list, type, webServerName, account, apiEndpoint, accountURL) {
    if (list.length === 0) return '';

    const isOpen = list.length < 3 ? 'open' : '';
    const pluralType = type === 'reply' ? 'replies' : `${type}s`;
    
    return `
        <details class="content-details ${pluralType}-details" ${isOpen}>
            <summary class="content-summary"><a href="${webServerName}/@${account}/${pluralType}" target="_blank">${pluralType.charAt(0).toUpperCase() + pluralType.slice(1)} (${list.length}</a>)</summary>
            <div class="content-inner ${pluralType}-content">
                ${await processItems(list, type, apiEndpoint, webServerName, accountURL)}
            </div>
        </details>
    `;
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
