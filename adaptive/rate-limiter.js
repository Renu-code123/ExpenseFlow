// Adaptive Rate Limiter Orchestrator
// Integrates analytics, ML risk scoring, quota management, and logging

const analytics = require('./analytics');
const mlRisk = require('./ml-risk');
const quota = require('./quota');
const logger = require('./logger');

class AdaptiveRateLimiter {
    constructor(options = {}) {
        this.defaultLimit = options.defaultLimit || 1000;
    }

    recordRequest(userId, endpoint, status = 'success') {
        analytics.recordRequest(userId, endpoint, status);
        const userStats = analytics.getUserStats(userId);
        const riskScore = mlRisk.updateUserScore(userId, userStats);
        quota.adjustLimit(userId, riskScore);
        logger.log('request', { userId, endpoint, status, riskScore, limit: quota.getUserLimit(userId) });
    }

    isAllowed(userId) {
        const limit = quota.getUserLimit(userId);
        const userStats = analytics.getUserStats(userId);
        return userStats.requests < limit;
    }

    getUserLimit(userId) {
        return quota.getUserLimit(userId);
    }

    getUserRiskScore(userId) {
        return mlRisk.getUserScore(userId);
    }

    getLogs() {
        return logger.getLogs();
    }
}

module.exports = new AdaptiveRateLimiter();
