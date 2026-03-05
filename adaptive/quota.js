// Dynamic Quota Adjustment
// Adjusts user quotas based on risk score

class QuotaManager {
    constructor(defaultLimit = 1000) {
        this.defaultLimit = defaultLimit;
        this.userLimits = new Map(); // userId -> limit
    }

    adjustLimit(userId, riskScore) {
        let limit = this.defaultLimit;
        if (riskScore > 100) limit = Math.max(50, this.defaultLimit * 0.05);
        else if (riskScore > 50) limit = Math.max(200, this.defaultLimit * 0.2);
        else if (riskScore < 10) limit = this.defaultLimit * 2;
        this.userLimits.set(userId, Math.floor(limit));
        return limit;
    }

    getUserLimit(userId) {
        return this.userLimits.get(userId) || this.defaultLimit;
    }

    getAllLimits() {
        return Array.from(this.userLimits.entries());
    }
}

module.exports = new QuotaManager();
