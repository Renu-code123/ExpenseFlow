// Real-Time Analytics for API Usage
// Tracks requests, user actions, endpoint stats

class Analytics {
    constructor() {
        this.userStats = new Map(); // userId -> stats
        this.endpointStats = new Map(); // endpoint -> stats
    }

    recordRequest(userId, endpoint, status, timestamp = Date.now()) {
        if (!this.userStats.has(userId)) {
            this.userStats.set(userId, {
                requests: 0,
                failedLogins: 0,
                requestsPerMinute: 0,
                lastMinute: [],
                endpoints: {}
            });
        }
        const stats = this.userStats.get(userId);
        stats.requests++;
        stats.lastMinute.push(timestamp);
        stats.lastMinute = stats.lastMinute.filter(ts => timestamp - ts < 60000);
        stats.requestsPerMinute = stats.lastMinute.length;
        if (!stats.endpoints[endpoint]) stats.endpoints[endpoint] = 0;
        stats.endpoints[endpoint]++;
        if (status === 'fail') stats.failedLogins++;
        this.userStats.set(userId, stats);

        // Endpoint stats
        if (!this.endpointStats.has(endpoint)) {
            this.endpointStats.set(endpoint, { requests: 0, users: new Set() });
        }
        const epStats = this.endpointStats.get(endpoint);
        epStats.requests++;
        epStats.users.add(userId);
        this.endpointStats.set(endpoint, epStats);
    }

    getUserStats(userId) {
        return this.userStats.get(userId) || {
            requests: 0,
            failedLogins: 0,
            requestsPerMinute: 0,
            endpoints: {}
        };
    }

    getEndpointStats(endpoint) {
        return this.endpointStats.get(endpoint) || { requests: 0, users: new Set() };
    }

    getAllUserStats() {
        return Array.from(this.userStats.entries());
    }

    getAllEndpointStats() {
        return Array.from(this.endpointStats.entries());
    }
}

module.exports = new Analytics();
