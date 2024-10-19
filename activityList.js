/* global chrome */

document.addEventListener('DOMContentLoaded', async () => {
    const thisActivityPageViewTime = new Date().toISOString();
    if (await acquireLock('activityList', 2)) { // Higher priority
        await clearAllNotifications();
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

            let allIgnores = [];
            await getAllIgnoredAccounts(steemObserverName)
                .then(ignoredAccounts => {
                    allIgnores = ignoredAccounts;
                })
                .catch(error => console.error('Error:', error));
            // console.debug(`Ignoring the following accounts: ${allIgnores}`);
                
            /*
             * Display the last displayed time.
             */
            const previousAlertTimeField = document.getElementById("previous-alert-time");
            if (previousAlertTimeField) {
                previousAlertTimeField.textContent = new Date (lastActivityPageViewTime).toLocaleString();
            }

            // If the account is followed and muted, this should remove it.  Replies from muted accounts will still exist.
            let uniqueAccountsWithNewActivity = filterUniqueAccounts(accountsWithNewActivity);
            const nonIgnoredAccountsWithNewActivity = removeIgnoredAccounts(uniqueAccountsWithNewActivity, allIgnores);
            uniqueAccountsWithNewActivity = nonIgnoredAccountsWithNewActivity;
            uniqueAccountsWithNewActivity = await updateAccountsList(uniqueAccountsWithNewActivity, steemObserverName, allIgnores);

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
    await deleteDuplicateTable();
     // After all data is loaded and the page is populated, change the background color
     document.body.style.backgroundColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--altBgColor').trim();

}); // End of document.addEventListener()

/*
 * Create the HTML for the posts, replies, and comments.
 */
async function updateAccountsList(uniqueAccountsWithNewActivity, steemObserverName, allIgnores) {
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
        let activities = {
            postList: [],
            commentList: [],
            replyList: []
        };

        const ldt = followedAccountObj.lastDisplayTime;
        const followedAcct = followedAccountObj.account;
        const actTime = followedAccountObj.activityTime;
        try {
            // Account history checks are time consuming.  Only check accounts that were flagged during background polling.
            // This means that some accounts with updates might not display until after the next polling cycle.
            let content;

            if (new Date(ldt) < new Date(actTime)) {
                activities = await getAccountActivities(followedAcct, ldt, apiEndpoint);
                content = await processAllItems(...Object.values(activities), followedAcct, apiEndpoint,
                    webServerName, ldt, steemObserverName, allIgnores);
                listItem.innerHTML = content;
            }
            if (isEmptyActivityList(activities)) {
                lastActivity = new Date(`${actTime}`);
            } else {
                lastActivity = getLastActivityTimeFromAll(activities);
            }
        } catch (error) {
            console.warn(`Error fetching activities for account ${followedAcct} after ${actTime}: ${error}.`);
            // listItem.textContent = `Error fetching activities for account ${followedAccountObj.account}`;
            continue;
        }

        accountsList.appendChild(listItem);
        uniqueAccountsWithNewActivity = updateLastDisplayTime(uniqueAccountsWithNewActivity, followedAccountObj.account, lastActivity);
    }
    return uniqueAccountsWithNewActivity;
}

async function createContentItem(item, type, webServerName, rootInfo, allIgnores ) {
    // No need to check duplicates here.  They were filtered out earlier.
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

    if ( allIgnores.includes ( author ) ) {
        return "ignored";
    }
    // console.debug(`Inside createContentItem - author:${author}`);
    // console.debug(`Inside createContentItem - Ignores:${allIgnores}`);


    const plainBody = body.startsWith("@@") ? "[content edited]" : convertToPlainText(body);
    const bodySnippet = plainBody.length > 255 ? plainBody.substring(0, 255) + '...' : plainBody;

    let content = `<li class="post-box">`;

    content += `<strong>Author:</strong> <a href="${webServerName}/@${author}" target="_blank">${author}</a> / <strong>Date & Time:</strong> <a href="${webServerName}/@${author}/${permlink}" target="_blank">${new Date(timestamp + 'Z').toLocaleString()}</a><br>`;

    if (type === 'post') {
        content += `<strong>Post: <A HREF="${webServerName}/@${author}/${permlink}" target="_blank">${title}</a></strong>`;
    } else {
        // For comments and replies

        const root_author = rootInfo.root_author;
        const root_permlink = rootInfo.root_permlink;
        const root_title = rootInfo.root_title;

        content += `<strong>Thread: </strong><a href="${webServerName}/@${root_author}/${root_permlink}" target="_blank">${root_title}</a><br>`;

        if (parent_author !== root_author || parent_permlink !== root_permlink) {
            // This is a nested reply
            content += `<strong>Reply to:</strong> <a href="${webServerName}/@${parent_author}/${parent_permlink}" target="_blank">/@${parent_author}/${parent_permlink}</a><br>`;
        }
    }

    content += '<br><br>';
    content += `${bodySnippet}...`;
    content += '<br>';
    content += `</li>`;

    console.dir(content);
    return content;
}

async function processItems(items, type, apiEndpoint, webServerName, allIgnores) {
    let content;
    content = `<div class="indented-content">`;
    let rootInfo;

    for (const item of items) {
        if (type !== 'post') {
            rootInfo = await getRootInfo(item[1].op[1].author, item[1].op[1].permlink, apiEndpoint);
            if (rootInfo) {
                // console.log(`Got rootInfo: ${rootInfo}`);
                console.dir(rootInfo);
                item[1].op[1].root_author = rootInfo.root_author;
                item[1].op[1].root_permlink = rootInfo.root_permlink;
                item[1].op[1].root_title = rootInfo.root_title;
            } else {
                console.debug("Failed to retrieve rootInfo");
            }
        }
        content += await createContentItem(item, type, webServerName, rootInfo, allIgnores );
    }

    content += `</ul></div>`;
    return content;
}

async function processAllItems(postList, commentList, replyList, account, apiEndpoint, 
    webServerName, lastDisplayTime, steemObserverName, allIgnores ) {
    if (postList.length === 0 && commentList.length === 0 && replyList.length === 0) {
        return "";
    }
    if ( account === steemObserverName && replyList.length === 0 ) {
        return "";
    }

    let content = `
        <details class="account-details" open>
            <summary class="account-summary"><strong><a href="${webServerName}/@${account}" target="_blank">${account}</a></strong>: Activity after ${new Date(lastDisplayTime).toLocaleString()}</summary>
            <div class="account-content">
        `;

    // console.debug(`account: ${account}, observer: ${steemObserverName},
        // # posts: ${postList.length}, # comments: ${commentList.length}, # replies: ${replyList.length}`);

    // If the account is the observer, we don't need to see posts & comments.  Presumably the observer/author already knows about them.
    // If the account is followed and muted, mute overrides (these should already be removed, earlier, though)
    if (account !== steemObserverName) {
        content += await generateContentSection(postList, 'post', webServerName, account, apiEndpoint, allIgnores);
        content += await generateContentSection(commentList, 'comment', webServerName, account, apiEndpoint, allIgnores);
    }
    replyList = removeIgnoredReplies(replyList, allIgnores); // filter muted accounts
    content += await generateContentSection(replyList, 'reply', webServerName, account, apiEndpoint, allIgnores);

    content += `
            </div>
        </details>
        `;

    return content;
}

async function generateContentSection(list, type, webServerName, account, apiEndpoint, allIgnores = [] ) {
    if (list.length === 0) return '';

    const isOpen = list.length < 3 ? 'open' : '';
    const pluralType = type === 'reply' ? 'replies' : `${type}s`;

    return `
        <details class="content-details ${pluralType}-details" ${isOpen}>
            <summary class="content-summary"><a href="${webServerName}/@${account}/${pluralType}" target="_blank">${pluralType.charAt(0).toUpperCase() + pluralType.slice(1)} (${list.length}</a>)</summary>
            <div class="content-inner ${pluralType}-content">
                ${await processItems(list, type, apiEndpoint, webServerName, allIgnores)}
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

async function getAllIgnoredAccounts(account) {
    const apiEndpoint = await getApiServerName();
    const limit = 1000;
    let start = null;
    const ignoredAccounts = new Set();
  
    while (true) {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'follow_api.get_following',
          params: {
            account: account,
            start: start,
            type: 'ignore',
            limit: limit
          },
          id: 1
        })
      });
  
      const data = await response.json();
  
      if (!data.result || data.result.length === 0) {
        break;
      }
  
      data.result.forEach(entry => {
        if (entry.what.includes('ignore')) {
          ignoredAccounts.add(entry.following);
        }
      });
  
      if (data.result.length < limit) {
        break;
      }
  
      start = data.result[data.result.length - 1].following;
    }
  
    return Array.from(ignoredAccounts);
  }
  
  function removeIgnoredAccounts(accountsWithNewActivity, allIgnores) {
    return accountsWithNewActivity.filter(activity => !allIgnores.includes(activity.account));
  }
  
  function removeIgnoredReplies(replyList, allIgnores) {
    const filteredReplies = replyList.filter(reply => !allIgnores.includes(reply[1].op[1].author));
    return filteredReplies;
  }
