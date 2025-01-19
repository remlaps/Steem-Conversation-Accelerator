class ContentFetcher {
    constructor(apiEndpoint = 'https://api.steemit.com') {
        this.apiEndpoint = apiEndpoint;
    }

    async fetchContent(account, permlink) {
        try {
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

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.result;
            
        } catch (error) {
            throw new Error(`Failed to fetch content: ${error.message}`);
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
