// Adaptive Rate Limiting for API Abuse Prevention
// Issue #995
// Dynamically adjusts quotas using real-time analytics and ML risk scoring

const analytics = require('./analytics-dashboard'); // Example analytics module
const anomalyDetector = require('./anomaly-detector'); // Example ML module

class AdaptiveRateLimiter {
    constructor(options = {}) {
        this.defaultLimit = options.defaultLimit || 1000; // requests per hour
        this.userLimits = new Map(); // userId -> limit
        this.usage = new Map(); // userId -> [timestamps]
        this.riskScores = new Map(); // userId -> score
    }

    recordRequest(userId) {
        const now = Date.now();
        if (!this.usage.has(userId)) {
            this.usage.set(userId, []);
        }
        this.usage.get(userId).push(now);
        this.updateRiskScore(userId);
        this.adjustLimit(userId);
    }

    isAllowed(userId) {
        const limit = this.userLimits.get(userId) || this.defaultLimit;
        const windowMs = 60 * 60 * 1000; // 1 hour
        const now = Date.now();
        const timestamps = (this.usage.get(userId) || []).filter(ts => now - ts < windowMs);
        this.usage.set(userId, timestamps);
        return timestamps.length < limit;
    }

    updateRiskScore(userId) {
        // Use analytics and ML to score risk
        const usageStats = analytics.getUserStats(userId);
        const anomaly = anomalyDetector.detect(usageStats);
        let score = 0;
        if (anomaly.isAnomalous) score += 50;
        score += usageStats.failedLogins * 2;
        score += usageStats.requestsPerMinute;
        this.riskScores.set(userId, score);
    }

    adjustLimit(userId) {
        // Lower limit for high risk, raise for low risk
        const score = this.riskScores.get(userId) || 0;
        let limit = this.defaultLimit;
        if (score > 80) limit = Math.max(100, this.defaultLimit * 0.1);
        else if (score > 50) limit = Math.max(300, this.defaultLimit * 0.3);
        else if (score < 10) limit = this.defaultLimit * 2;
        this.userLimits.set(userId, Math.floor(limit));
    }

    getUserLimit(userId) {
        return this.userLimits.get(userId) || this.defaultLimit;
    }

    getUserRiskScore(userId) {
        return this.riskScores.get(userId) || 0;
    }
}

module.exports = AdaptiveRateLimiter;
