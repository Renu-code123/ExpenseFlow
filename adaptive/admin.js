// Admin utility for Adaptive Rate Limiting
// Allows manual override of quotas and risk scores

const quota = require('./quota');
const mlRisk = require('./ml-risk');

function setUserLimit(userId, limit) {
    quota.userLimits.set(userId, limit);
    console.log(`Set quota for ${userId} to ${limit}`);
}

function setUserRiskScore(userId, score) {
    mlRisk.userScores.set(userId, score);
    console.log(`Set risk score for ${userId} to ${score}`);
}

function printAllLimits() {
    console.log('User Quotas:');
    for (const [userId, limit] of quota.getAllLimits()) {
        console.log(`${userId}: ${limit}`);
    }
}

function printAllScores() {
    console.log('User Risk Scores:');
    for (const [userId, score] of mlRisk.getAllScores()) {
        console.log(`${userId}: ${score}`);
    }
}

module.exports = {
    setUserLimit,
    setUserRiskScore,
    printAllLimits,
    printAllScores
};
