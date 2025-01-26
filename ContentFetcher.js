class ContentFetcher {
    constructor(apiEndpoint = 'https://api.steemit.com') {
        this.apiEndpoint = apiEndpoint;
        this.retryErrors = [503]; // List of HTTP errors to retry
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchContent(account, permlink, retries = 10) {
        try {
            // console.debug(`Trying fetchContent: ${account}/${permlink}, retries: ${retries}, apiEndpoint: ${this.apiEndpoint}`);
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'condenser_api.get_content',
                    params: [account, permlink],
                    id: 1
                })
            });

            // console.debug(`fetchContent: ${response.status} ${response.statusText}`);
            if (!response.ok) {
                if (this.retryErrors.includes(response.status) && retries > 0) {
                    console.warn(`HTTP error ${response.status}. Retrying in 1 second...`);
                    await this.sleep(1000);
                    return this.fetchContent(account, permlink, retries - 1);
                } else {
                    console.warn(`HTTP error! status: ${response.status}`);
                    return;
                }
            }

            const data = await response.json();
            // console.debug(`fetchContent: ${data.result.author}/${data.result.permlink}`);
            return data.result;

        } catch (error) {
            console.debug(`Failed to fetch content: ${error.message}, retries: ${retries}, apiEndpoint: ${this.apiEndpoint}
                ${account}/${permlink}`);
        }
    }

    // New method to get content
    async getContent(account, permlink) {
        return await this.fetchContent(account, permlink);
    }

    getTags(category, json_metadata, depth) {
        const tagsSet = new Set();
        
        // Add the category to the set
        if (category) {
            tagsSet.add(category);
        }
    
        if (json_metadata && typeof json_metadata === 'string' && json_metadata.trim() !== '') {
            try {
                const jsonMeta = JSON.parse(json_metadata);
                if (Array.isArray(jsonMeta.tags)) {
                    jsonMeta.tags.forEach(tag => tagsSet.add(tag));
                } else {
                    if (depth === 0) {
                        console.warn('jsonMeta.tags is not an array:', jsonMeta.tags);
                        console.warn(`@${author}/${permlink}`);
                        tagsSet.add(jsonMeta.tags);
                    }
                }
            } catch (e) {
                console.warn('Error parsing json_metadata:', e);
            }
        }
    
        // Convert the Set back to a string with ';' separator
        return Array.from(tagsSet).join(';');
    }
}
