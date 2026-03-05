// Adaptive Rate Limiting Dashboard (CLI)
// Displays user stats, risk scores, quotas, and logs

const analytics = require('./analytics');
const mlRisk = require('./ml-risk');
const quota = require('./quota');
const logger = require('./logger');

function printDashboard() {
    console.log('--- Adaptive Rate Limiting Dashboard ---');
    console.log('User Stats:');
    for (const [userId, stats] of analytics.getAllUserStats()) {
        console.log(`User: ${userId}`);
        console.log('  Requests:', stats.requests);
        console.log('  Requests/min:', stats.requestsPerMinute);
        console.log('  Endpoints:', Object.keys(stats.endpoints));
        console.log('  Failed Logins:', stats.failedLogins);
        console.log('  Risk Score:', mlRisk.getUserScore(userId));
        console.log('  Quota:', quota.getUserLimit(userId));
        console.log('---');
    }
    console.log('Recent Logs:');
    const logs = logger.getLogs().slice(-10);
    for (const log of logs) {
        console.log(log);
    }
}

printDashboard();
