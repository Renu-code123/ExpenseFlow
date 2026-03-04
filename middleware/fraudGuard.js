const anomalyService = require('../services/anomalyService');
const notificationService = require('../services/notificationService');

/**
 * Fraud Guard Middleware
 * Issue #645: Intercepts transaction processing to flag risks in real-time
 */
const fraudGuard = async (req, res, next) => {
    // Only run on transaction creation
    if (!(req.method === 'POST' && req.originalUrl.includes('/api/expenses'))) {
        return next();
    }

    // Capture the original response json method to analyze AFTER creation
    const originalJson = res.json;
    res.json = async function (data) {
        if (res.statusCode === 201 && data.success && data.data) {
            try {
                const transaction = data.data;
                const analyzedTx = await anomalyService.analyzeTransaction(transaction);

                // If it's a high-risk anomaly, notify the user immediately
                if (analyzedTx.riskScore > 75) {
                    await notificationService.dispatch(req.user._id, 'security_anomaly', {
                        event: 'High Risk Transaction',
                        location: analyzedTx.formattedAddress || 'Unknown',
                        amount: analyzedTx.amount,
                        merchant: analyzedTx.merchant || 'Unknown'
                    });
                }

                // Re-assign back to data for the response
                data.data = analyzedTx;
            } catch (error) {
                console.error('[FraudGuard] Analysis failed:', error);
            }
        }
        return originalJson.call(this, data);
    };

    next();
};

module.exports = fraudGuard;
