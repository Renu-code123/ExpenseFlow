/**
 * Treasury Math Utility
 * Issue #768: Financial formulas for reserve ratios and flow velocity.
 */
class MathTreasury {
    /**
     * Calculate the required reserve based on burn rate and target ratio
     */
    static calculateTargetReserve(monthlyBurnRate, safetyFactor = 1.2, targetRatio = 0.2) {
        // Reserve should cover (BurnRate * Ratio) with a safety factor
        return monthlyBurnRate * targetRatio * safetyFactor;
    }

    /**
     * Calculate liquidity flow velocity (Burn rate per day)
     */
    static calculateFlowVelocity(totalOutflow, days) {
        if (days === 0) return 0;
        return totalOutflow / days;
    }

    /**
     * Determine rebalancing amount to reach target
     */
    static getRebalanceDelta(currentBalance, targetBalance) {
        return targetBalance - currentBalance;
    }

    /**
     * Calculate liquidity coverage ratio
     */
    static calculateCoverageRatio(totalLiquidity, monthlyBurnRate) {
        if (monthlyBurnRate === 0) return 999;
        return totalLiquidity / monthlyBurnRate;
    }
}

module.exports = MathTreasury;
