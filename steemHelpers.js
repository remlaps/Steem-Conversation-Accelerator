/*
 *   - This file is not presently in use, but it will start holding Steem-related helper functions
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

async function fastActivityCheck(user, apiNode) {
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

        const lastPostTime = data.result.accounts[0].last_post;
        return lastPostTime; // Return last post time
    } catch (error) {
        console.warn(`Error fetching last post time for ${user}:`, error);
        return null; // Return null on exception
    } finally {
    }
}