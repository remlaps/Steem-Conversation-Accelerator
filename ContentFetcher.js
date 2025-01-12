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
}
