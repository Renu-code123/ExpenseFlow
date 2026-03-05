const taxOptimizationEngine = require('../services/taxOptimizationEngine');

/**
 * Tax Deduction Interceptor middleware
 * Issue #843: Flagging "Deductible" vs "Non-Deductible" transactions in real-time.
 */
const taxDeductionInterceptor = async (req, res, next) => {
    // Only intercept POST/PUT for expenses that have the necessary fields
    if ((req.method === 'POST' || req.method === 'PUT') && req.path.includes('/expenses')) {
        try {
            const expenseData = req.body;
            const region = req.headers['x-region'] || 'US-CA';
            const workspaceId = req.headers['x-tenant-id'];

            if (expenseData.amount && workspaceId) {
                const taxEval = await taxOptimizationEngine.evaluateDeduction(workspaceId, expenseData, region);

                // Inject tax metadata into the request body for downstream persistence
                req.body.taxMetadata = {
                    ...taxEval,
                    interceptedAt: new Date(),
                    region
                };
            }
        } catch (error) {
            console.error('[TaxDeductionInterceptor] Evaluation failed:', error);
        }
    }
    next();
};

module.exports = taxDeductionInterceptor;
