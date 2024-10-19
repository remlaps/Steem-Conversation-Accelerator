async function getAccountActivities(account, startTime, apiEndpoint) {
    const startTimeStamp = new Date(startTime).getTime();
    let postList = [], commentList = [], replyList = [];
    let lastId = -1;
    const chunkSize = 20;

    async function fetchAccountHistory(lastId, limit, retries = 10) {
        while (retries > 0) {
            try {
                const response = await fetch(apiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "condenser_api.get_account_history",
                        params: [account, lastId, limit],
                        id: 1
                    })
                });

                const jsonResponse = await response.json();
                if (jsonResponse.error) {
                    // if (jsonResponse.error.code === -32801 || jsonResponse.error.code === -32603) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        retries--;
                    // } else {
                    //     return jsonResponse;
                    // }
                } else {
                    return jsonResponse;
                }
            } catch (error) {
                console.warn(`Error fetching account history, retrying. Attempts left: ${retries}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                retries--;
            }
        }
        console.warn('Failed to fetch account history after all retries');
        return null;
    }

    while (true) {
        const activities = await fetchAccountHistory(lastId, chunkSize);
        if (!activities.result || activities.result.length === 0) break;

        // Process activities in reverse order (from most recent to oldest)
        for (let i = activities.result.length - 1; i >= 0; i--) {
            // console.debug(`Checking ${activities.result[i]} in fetchAccountHistory`);
            const activity = activities.result[i];
            const [id, { timestamp, op }] = activity;
            const transactionTimeStamp = new Date(`${timestamp}Z`).getTime();

            if (transactionTimeStamp <= startTimeStamp  || new Date(`${timestamp}Z`) < new Date() - 2 * 60 * 60 * 1000 ) {
                // console.debug(`Returning from getAccountActivities for ${account}`);
                // console.debug(`   transactionTimeStamp: ${transactionTimeStamp}, startTimeStamp: ${startTimeStamp}`);
                // console.debug(`   transactionTimeStamp: ${timestamp}, startTimeStamp: ${startTime}`);
                return { postList, commentList, replyList };
            }

            // console.debug(`id: ${id}, timestamp: ${timestamp}, ttstamp: ${transactionTimeStamp}, startTime: ${startTimeStamp}, Operation: ${op[0]}`);
            if (op[0] === "comment") {
                if ( ! op[1].body.startsWith("@@") ) {
                    // Throw out edits.  They're more clutter than value.
                    const [, { parent_author, author, permlink }] = op;
                    isUnique = await maintainDuplicateTable (author, permlink );  // No need to display the same comment/reply twice.
                    if (isUnique) {
                        if (!parent_author) {
                            postList.push(activity);
                        } else if (author === account) {
                            commentList.push(activity);
                        } else {
                            replyList.push(activity);
                        }
                    } else {
                        console.debug(`steemHelpers:getAccountActivities - Throwing out duplicate for ${author}/${permlink}`);
                    }
                } else {
                    console.debug(`steemHelpers:getAccountActivities - Throwing out edit activity for ${op[1].body}`);
                }
            }

            lastId = id - 1;
        }
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
        console.warn("Error:", error);
        return null; // Or handle the error differently
    }
}

/*
 *
 *   - fastActivityCheckWithRetry and fastActivityCheck come from the first iteration of getAcctivityTime, but
 *     they are problematic 'cause they don't report on reply times.  They may eventually be useful, but they're
 *     not active as-of now.
 */

async function fastActivityCheckWithRetry(followedAccount, apiNode, retries = 3) {
    try {
        const currentActivityTime = await fastActivityCheck(followedAccount, apiNode);
        if (currentActivityTime !== null) {
            return currentActivityTime;
        } else {
            console.warn(`Failed to get activity time for ${followedAccount}. Retrying in 1 second... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            if (retries > 0) {
                return fastActivityCheckWithRetry(followedAccount, apiNode, retries - 1);
            } else {
                console.warn(`Failed to get activity time for ${followedAccount} after maximum retries.`);
                return null;
            }
        }
    } catch (error) {
        console.warn(`Error in fastActivityCheckWithRetry for ${followedAccount}:`, error);
        if (retries > 0) {
            console.warn(`Retrying fastActivityCheckWithRetry for ${followedAccount} in 1 second... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            return fastActivityCheckWithRetry(followedAccount, apiNode, retries - 1);
        } else {
            console.warn(`Failed to get activity time for ${followedAccount} after maximum retries due to error.`);
            return null;
        }
    }
}

async function getSteemAccountInfo(user, apiNode) {
    try {
        response = await fetch(apiNode, {
            keepalive: true,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'database_api.list_accounts',
                params: {
                    start: user,
                    limit: 1,
                    order: 'by_name'
                },
                id: 1
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`Error response: ${errorText}`);
            return null;
        }

        const data = await response.json();

        if (data.error) {
            console.warn(`Data error while fetching last post time for ${user}:`, data.error.message);
            return null; // Return null on error
        }

        if (!data.result || !data.result.accounts || data.result.accounts.length === 0) {
            console.warn(`No accounts found for ${user}`);
            return null; // No accounts found
        }

        return data;
    } catch (error) {
        console.warn(`Error fetching last post time for ${user}:`, error);
        return null; // Return null on exception
    } finally {
    }
}