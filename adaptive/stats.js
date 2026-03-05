// Statistics utility for Adaptive Rate Limiting
// Aggregates and reports usage, risk, and quota stats

const analytics = require('./analytics');
const mlRisk = require('./ml-risk');
const quota = require('./quota');

function getSummary() {
    const users = analytics.getAllUserStats().map(([userId, stats]) => ({
        userId,
        requests: stats.requests,
        requestsPerMinute: stats.requestsPerMinute,
        failedLogins: stats.failedLogins,
        endpoints: Object.keys(stats.endpoints),
        riskScore: mlRisk.getUserScore(userId),
        quota: quota.getUserLimit(userId)
    }));
    return users;
}

function printSummary() {
    const summary = getSummary();
    console.log('--- Adaptive Rate Limiting Summary ---');
    summary.forEach(user => {
        console.log(user);
    });
}

module.exports = {
    getSummary,
    printSummary
};
