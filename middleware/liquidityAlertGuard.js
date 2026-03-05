const LiquidityForecast = require('../models/LiquidityForecast');
const ResponseFactory = require('../utils/responseFactory');

/**
 * LiquidityAlertGuard Middleware
 * Issue #909: Warning users before they approve expenses that create a future deficit.
 * Checks the latest forecast before allowing large transactions.
 */
const liquidityAlertGuard = async (req, res, next) => {
    const workspaceId = req.headers['x-workspace-id'] || req.user?.activeWorkspace;
    const { amount } = req.body;

    if (!workspaceId || !amount || amount < 1000) {
        return next();
    }

    try {
        const latestForecast = await LiquidityForecast.findOne({ workspaceId })
            .sort({ simulationDate: -1 });

        if (!latestForecast) {
            return next();
        }

        // Check if there's any point in the next 30 days where insolvency risk > 20%
        const criticalState = latestForecast.projections.slice(0, 30).find(p => p.insolvencyRisk > 0.2);

        if (criticalState) {
            // If the transaction amount is > 50% of the worst-case projected balance at that date
            if (amount > criticalState.p10 * 0.5) {
                return ResponseFactory.error(res, 403,
                    `LIQUIDITY_RISK: This transaction of ${amount} poses a high insolvency risk based on latest Monte Carlo simulations (Projected risk on ${criticalState.date.toDateString()}).`
                );
            }
        }

        next();
    } catch (error) {
        console.error('[LiquidityGuard] Error checking forecast:', error);
        next();
    }
};

module.exports = liquidityAlertGuard;
