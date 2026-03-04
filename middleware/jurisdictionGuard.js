const nexusSwitchgear = require('../services/nexusSwitchgear');
const logger = require('../utils/structuredLogger');

/**
 * JurisdictionGuard Middleware
 * Issue #961: Enforcing tax-compliance based on detected Nexus.
 * Intercepts write requests, detects economic nexus, and injects tax context.
 */
const jurisdictionGuard = async (req, res, next) => {
    // Only apply to transaction-creating operations
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();

    const { amount, currency, merchantCoord, merchantIp } = req.body;

    // Skip if no financial payload or very small amounts
    if (!amount || amount < 1) return next();

    try {
        const transactionContext = {
            amount,
            currency: currency || req.headers['x-currency'],
            merchantCoord: merchantCoord || null, // [lng, lat]
            merchantIp: merchantIp || req.ip
        };

        const resolution = await nexusSwitchgear.resolve(transactionContext);

        if (resolution.applied) {
            // Inject nexus context into request for downstream handlers
            req.nexusContext = {
                jurisdictionCode: resolution.jurisdictionCode,
                taxType: resolution.taxType,
                taxRate: resolution.taxRate,
                mountedPolicy: resolution.policy?._id || null
            };

            logger.info('[JurisdictionGuard] Nexus applied', {
                jurisdiction: resolution.jurisdictionCode,
                taxRate: resolution.taxRate,
                amount,
                userId: req.user?._id
            });
        }

        next();
    } catch (error) {
        logger.error('[JurisdictionGuard] Nexus detection failed:', error);
        // Fail-open: allow request to proceed without nexus enforcement
        next();
    }
};

module.exports = jurisdictionGuard;
