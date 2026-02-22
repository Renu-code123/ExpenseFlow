const stressTestEngine = require('../services/stressTestEngine');
const logger = require('../utils/structuredLogger');

/**
 * Predictive Liquidity Guard
 * Issue #739: Middleware to prevent catastrophic expenses by running 
 * real-time stress test simulations before transaction approval.
 */
const liquidityGuard = async (req, res, next) => {
    try {
        const workspaceId = req.headers['x-workspace-id'] || req.body.workspaceId;
        const amount = parseFloat(req.body.amount || 0);

        // Only guard significant expenses (e.g. > 1000)
        if (!workspaceId || amount < 1000 || req.path.includes('/income')) {
            return next();
        }

        console.log(`[LiquidityGuard] Evaluating stress for expense of ${amount} in Workspace ${workspaceId}`);

        const evaluation = await stressTestEngine.evaluateLiquidity(workspaceId, amount);

        if (evaluation.status === 'critical') {
            logger.warn('CAUTION: Expense blocked by Liquidity Guard', {
                workspaceId,
                amount,
                ruinProbability: evaluation.maxRuinProbability
            });

            return res.status(403).json({
                success: false,
                error: 'Financial Safety Violation',
                message: 'This expense poses a high risk to workspace liquidity based on current stress-test simulations.',
                evaluationSummary: {
                    status: evaluation.status,
                    riskScore: Math.round(evaluation.maxRuinProbability * 100)
                }
            });
        }

        // Attach evaluation to request for optional downstream use
        req.liquidityContext = evaluation;
        next();
    } catch (err) {
        console.error('[LiquidityGuard Error]:', err.message);
        next(); // Fail open but log
    }
};

module.exports = liquidityGuard;
