class CommentFetcher {
    constructor(apiEndpoint) {
        this.apiEndpoint = apiEndpoint;
        console.log(`Initialized apiEndpoint: ${apiEndpoint}`);
        this.isRunning = false;
        this.depthCount = new Map();
        this.authors = new Set();
        this.lastProcessedDate = null;
        this.currentStart = null;
        this.cutoffTime = null;
        this.taggedCommentsBuffer = []; // Temporary buffer to store tagged comments
    }

    async initializeStartTime() {
        // Get current time in UTC
        const now = new Date();
        const utcNow = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            now.getUTCHours(),
            now.getUTCMinutes(),
            now.getUTCSeconds()
        ));

        // Get 30 minutes ago in UTC
        const thirtyMinutesAgo = new Date(utcNow.getTime() - (30 * 60 * 1000));

        // Set initial start time to 7 days after thirty minutes ago
        this.currentStart = new Date(thirtyMinutesAgo.getTime() + (7 * 24 * 60 * 60 * 1000))
            .toISOString()
            .replace(/\.\d{3}Z$/, '');

        this.cutoffTime = thirtyMinutesAgo.toISOString().replace(/\.\d{3}Z$/, '');

        console.log('UTC Now:', utcNow.toISOString());
        console.log('Cutoff time:', this.cutoffTime);

        const stored = await chrome.storage.local.get(['lastProcessedDate']);
        if (stored && stored.lastProcessedDate) {
            this.lastProcessedDate = stored.lastProcessedDate;
            // Create UTC date from stored date
            const lastProcessedUTC = new Date(stored.lastProcessedDate);
            this.currentStart = new Date(Date.UTC(
                lastProcessedUTC.getUTCFullYear(),
                lastProcessedUTC.getUTCMonth(),
                lastProcessedUTC.getUTCDate(),
                lastProcessedUTC.getUTCHours(),
                lastProcessedUTC.getUTCMinutes(),
                lastProcessedUTC.getUTCSeconds()
            ));
            console.log(`Stored date: ${lastProcessedUTC}`);
            this.currentStart = new Date(this.currentStart.getTime() + (7 * 24 * 60 * 60 * 1000))
                .toISOString()
                .replace(/\.\d{3}Z$/, '');
        }
        console.log('Initial start time:', this.currentStart);
    }

    async fetchComments() {
        const LIMIT = 100;
        let keepFetching = true;
        let totalProcessed = 0;

        if (!this.currentStart || !this.cutoffTime) {
            await this.initializeStartTime();
        }
        console.log('Fetching with start time:', this.currentStart);

        while (keepFetching) {
            const payload = {
                jsonrpc: "2.0",
                method: "database_api.list_comments",
                params: {
                    start: [this.currentStart, "", ""],
                    limit: LIMIT,
                    order: "by_cashout_time"
                },
                id: 1
            };

            try {
                const response = await fetch(this.apiEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (!data.result?.comments || !Array.isArray(data.result.comments)) {
                    console.log("No comments in response or invalid format");
                    return false;
                }

                const comments = data.result.comments;

                if (comments.length === 0) {
                    console.log("No comments to process");
                    return false;
                }

                let newDataFound = false;
                let reachedCurrentTime = false;

                for (const comment of comments) {
                    const {
                        author,
                        body,
                        category,
                        created,
                        depth,
                        parent_author,
                        parent_permlink,
                        permlink,
                        root_author,
                        root_permlink,
                        json_metadata,
                        title
                    } = comment;

                    if (created.startsWith('2016')) {
                        console.log("Reached 2016 posts - stopping to avoid infinite loop");
                        return true;
                    }

                    // Skip entries older than our cutoff time (only for first run)
                    if (!this.lastProcessedDate && created < this.cutoffTime) {
                        continue;
                    }

                    // Skip entries we've already processed
                    if (this.lastProcessedDate && created <= this.lastProcessedDate) {
                        continue;
                    }

                    newDataFound = true;
                    const fetcher = new ContentFetcher(this.apiEndpoint);
                    let tags = fetcher.getTags(category, json_metadata);
                    if ( root_author !== author || root_permlink !== permlink ) {
                        const rootPost = fetcher.getContent(root_author, root_permlink);
                        const rootJsonMetadata = rootPost.json_metadata;
                        tags = `${tags};${fetcher.getTags(rootPost.category, rootJsonMetadata, rootPost.depth)}`;
                    }


                    // Load tags from chrome.storage.local
                    let savedTags = '';
                    const tagsResult = await chrome.storage.local.get(['tags']);
                    savedTags = tagsResult.tags || [];
                    this.logComments(comment, tags, savedTags);

                    this.depthCount.set(depth, (this.depthCount.get(depth) || 0) + 1);
                    this.authors.add(author);

                    this.lastProcessedDate = created;

                    // Check if we've caught up to current time (in UTC)
                    const createdDate = new Date(created + 'Z'); // Force UTC
                    const nowUTC = new Date(Date.now());
                    if (createdDate.getTime() > nowUTC.getTime() - (30 * 60 * 1000) + (7 * 24 * 60 * 60 * 1000)) {
                        reachedCurrentTime = true;
                        break;
                    }

                    // Update start date for next fetch (in UTC)
                    this.currentStart = new Date(Date.UTC(
                        createdDate.getUTCFullYear(),
                        createdDate.getUTCMonth(),
                        createdDate.getUTCDate(),
                        createdDate.getUTCHours(),
                        createdDate.getUTCMinutes(),
                        createdDate.getUTCSeconds()
                    ));
                    this.currentStart = new Date(this.currentStart.getTime() + (7 * 24 * 60 * 60 * 1000))
                        .toISOString()
                        .replace(/\.\d{3}Z$/, '');
                }
                this.saveComments();
                console.log(`Fetch complete: ${this.currentStart}`);

                totalProcessed += comments.length;
                console.log(`Processed batch of ${comments.length} comments (total: ${totalProcessed})`);

                keepFetching = newDataFound &&
                    comments.length === LIMIT &&
                    !reachedCurrentTime;

                if (reachedCurrentTime) {
                    console.log("Caught up to current time");
                    return true;
                }

                if (comments.length < LIMIT) {
                    console.log("Received less than limit, stopping");
                    return true;
                }

                if (!newDataFound) {
                    console.log("No new data found");
                    return false;
                }

            } catch (error) {
                console.error('Error fetching comments:', error);
                return false;
            }
        }

        // Save the last processed date to storage
        await chrome.storage.local.set({ lastProcessedDate: this.lastProcessedDate });
        return true;
    }

    async startPolling(intervalMinutes = 10) {
        if (this.isRunning) return;
        this.isRunning = true;

        await this.initializeStartTime();

        const poll = async () => {
            if (!this.isRunning) return;

            console.log(`Fetching comments from ${this.currentStart}`);
            const hasMore = await this.fetchComments();

            // Save comments to storage after fetching
            await this.saveComments();

            setTimeout(poll, intervalMinutes * 60 * 1000);
        };

        await poll();
    }

    stopPolling() {
        this.isRunning = false;
    }

    changeApiEndpoint(apiEndpoint) {
        this.apiEndpoint = apiEndpoint;
    }

    getMetrics() {
        return {
            depthCounts: Object.fromEntries(this.depthCount),
            uniqueAuthors: this.authors.size,
            authorsList: Array.from(this.authors),
            lastProcessedDate: this.lastProcessedDate
        };
    }

    logComments(comment, tags, tagFilters = '') {
        const {
            author,
            body,
            created,
            depth,
            json_metadata,
            parent_author,
            parent_permlink,
            permlink,
            root_author,
            root_permlink,
            title
        } = comment;

        // Split the tags string into an array of words
        const tagArray = tags.split(';');

        // Check if any tag in the tagArray matches any tagFilter
        const isMatch = tagArray.some(filter => tagFilters.includes(filter));

        // Create a record object
        const record = {
            author,
            body,
            created,
            depth,
            json_metadata,
            parent_author,
            parent_permlink,
            permlink,
            root_author,
            root_permlink,
            tags,
            title
        };

        // Log the comment if tagFilters is empty or there's a match
        if (tagFilters.length === 0 || isMatch) {
            console.log(record);
            // Store the record in the buffer
            this.taggedCommentsBuffer.push(record);
        }
    }

    // In commentFetcher.js
    async saveComments() {
        if (this.taggedCommentsBuffer.length === 0) {
            console.log('No comments to save');
            return;
        }

        // Acquire the tag lock with lower priority
        const lockAcquired = await acquireTaggedCommentsLock('background', 1);
        if (!lockAcquired) {
            console.log('Failed to acquire tag lock, retrying later');
            return;
        }

        try {
            // Get existing tagged comments from storage
            const result = await chrome.storage.local.get('taggedComments');
            const existingComments = result.taggedComments || [];

            // Concatenate new comments with existing comments
            const allComments = existingComments.concat(this.taggedCommentsBuffer);

            // Save the combined list back to storage
            await chrome.storage.local.set({ taggedComments: allComments });

            console.log('Comments saved successfully');
        } catch (error) {
            console.error('Error saving comments:', error);
        } finally {
            // Release the tag lock
            await releaseTaggedCommentsLock('background');
            console.log('Tag lock released');

            // Clear the buffer after saving
            this.taggedCommentsBuffer = [];
        }
    }
}
