/**
 * Yield Math Utility
 * Issue #959: Calculating opportunity cost of idle capital and yield optimization.
 */
class YieldMath {
    /**
     * Calculate opportunity cost of idle capital.
     * @param {number} amount - Amount of idle capital.
     * @param {number} rateDiff - Difference in annual yield rates (e.g., 0.04 for 4%).
     * @param {number} days - Duration in days.
     */
    static calculateOpportunityCost(amount, rateDiff, days = 1) {
        // Daily yield compounding roughly
        return amount * (rateDiff / 365) * days;
    }

    /**
     * Determine if a rebalance is beneficial after transaction costs.
     * @param {number} yieldGain - Projected yield gain.
     * @param {number} fee - Transaction fee for moving capital.
     * @param {number} threshold - Min gain multiple.
     */
    static isRebalanceBeneficial(yieldGain, fee, threshold = 2) {
        return yieldGain > (fee * threshold);
    }

    /**
     * Calculate optimal reserve ratio based on volatility.
     * @param {number} dailyVolatility - Standard deviation of daily spend.
     * @param {number} targetConfidence - Z-score (e.g., 1.96 for 95%).
     */
    static calculateOptimalReserve(dailyVolatility, targetConfidence = 1.645) {
        return dailyVolatility * targetConfidence;
    }
}

module.exports = YieldMath;
