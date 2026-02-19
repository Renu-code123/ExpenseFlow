const validationEngine = require('../services/validationEngine');

/**
 * Validation Interceptor Middleware
 * Issue #704: Globally intercepts write requests to enforce the validation pipeline.
 */
const validationInterceptor = async (req, res, next) => {
    // Only intercept routes that create or update financial data
    const financialRoutes = ['/api/expenses', '/api/income', '/api/transactions'];
    const isTarget = financialRoutes.some(route => req.originalUrl.startsWith(route));
    const isMutation = ['POST', 'PUT', 'PATCH'].includes(req.method);

    if (!isTarget || !isMutation || !req.body) {
        return next();
    }

    try {
        const userId = req.user ? req.user._id : 'system';
        const result = await validationEngine.validateAndRemediate(req.body, userId);

        if (!result.valid) {
            return res.status(422).json({
                success: false,
                error: 'Data failed quality threshold for persistence.',
                purityScore: result.purityScore,
                requestId: result.requestId
            });
        }

        // Replace request body with remediated/fixed data
        req.body = result.data;
        req.validationMetadata = {
            purityScore: result.purityScore,
            requestId: result.requestId
        };

        next();
    } catch (error) {
        console.error('[ValidationInterceptor] Failure:', error);
        res.status(500).json({ success: false, error: 'Internal validation pipeline error.' });
    }
};

module.exports = validationInterceptor;
