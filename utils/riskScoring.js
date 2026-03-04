/**
 * Risk Scoring Engine
 * Issue #757: Mathematical modeling for calculating violation severity 
 * based on hierarchical weights and deviation from base policies.
 */

class RiskScoring {
    /**
     * Calculate a normalized risk score (0-100)
     */
    static calculateScore(transaction, policyRule) {
        if (!policyRule) return 0;

        let score = 0;
        const amount = transaction.amount;
        const limit = policyRule.maxAmount;

        // 1. Threshold Breach (Logarithmic scale for exponential risk)
        if (amount > limit) {
            const breachRatio = amount / limit;
            score += Math.min(Math.log2(breachRatio) * 20, 50); // Max 50 points from amount breach
        }

        // 2. Policy Strictness (Weighted by level importance)
        score += (policyRule.riskWeight || 1) * 10;

        // 3. Category Risky Multiplier
        const riskyCategories = ['high-risk', 'unclassified', 'entertainment'];
        if (riskyCategories.includes(transaction.category)) {
            score *= 1.2;
        }

        // 4. Mode Adjustments
        if (policyRule.isBlocking) {
            score += 20;
        }

        return Math.min(Math.round(score), 100);
    }

    /**
     * Map score to a severity level
     */
    static getSeverity(score) {
        if (score >= 80) return 'critical';
        if (score >= 50) return 'high';
        if (score >= 25) return 'medium';
        return 'low';
    }
}

module.exports = RiskScoring;
