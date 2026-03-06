// ML-Based Risk Scoring for API Abuse
// Uses simple anomaly detection and scoring

class MLRiskScorer {
    constructor() {
        this.userScores = new Map(); // userId -> score
    }

    scoreUser(userStats) {
        // Example: basic scoring logic
        let score = 0;
        score += userStats.failedLogins * 5;
        score += userStats.requestsPerMinute * 2;
        score += Object.keys(userStats.endpoints).length;
        if (userStats.requests > 1000) score += 20;
        if (userStats.requestsPerMinute > 50) score += 50;
        return score;
    }

    updateUserScore(userId, userStats) {
        const score = this.scoreUser(userStats);
        this.userScores.set(userId, score);
        return score;
    }

    getUserScore(userId) {
        return this.userScores.get(userId) || 0;
    }

    getAllScores() {
        return Array.from(this.userScores.entries());
    }
}

module.exports = new MLRiskScorer();
