const eligibilityTraversalEngine = require('../services/eligibilityTraversalEngine');
const logger = require('../utils/structuredLogger');

/**
 * LineageGuard Middleware
 * Issue #866: Blocking transactions if the linked fund DNA doesn't match the expense category.
 * Ensures the "Genetic Integrity" of money flow.
 */
const lineageGuard = async (req, res, next) => {
    // Only intercept expense creation
    if (req.method === 'POST' && req.path.includes('/api/expenses')) {
        const { amount, category, treasuryNodeId, tags = [] } = req.body;

        if (!treasuryNodeId) {
            return next(); // Fallback to existing logic if node not specified
        }

        try {
            logger.info(`[LineageGuard] Verifying fund eligibility for ${amount} in ${category}`);

            // Perform dry-run check
            const result = await eligibilityTraversalEngine.findEligibleFunds(
                treasuryNodeId,
                amount,
                category.name || category, // Handle both ID and name if populated
                tags
            );

            if (!result.eligible) {
                return res.status(403).json({
                    success: false,
                    error: 'FUND_INELIGIBLE',
                    message: result.message,
                    details: 'The source funds in this treasury node are restricted and cannot be used for this category.'
                });
            }

            // Inject the selected fragments into the request for down-stream consumption
            req.eligibleFragments = result.selectedFragments;

        } catch (err) {
            logger.error(`[LineageGuard] Eligibility check failed`, { error: err.message });
            return res.status(500).json({ success: false, error: 'Internal eligibility check failure' });
        }
    }

    next();
};

module.exports = lineageGuard;
