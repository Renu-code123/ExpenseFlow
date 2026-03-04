const telemetryAggregator = require('../services/telemetryAggregator');
const logger = require('../utils/structuredLogger');

/**
 * Leakage Monitor Middleware
 * Issue #755: Detecting cross-tenant data access attempts.
 * Monitors for unauthorized attempts to access data outside of the assigned tenant scope.
 */
const leakageMonitor = (req, res, next) => {
    const originalJson = res.json;

    // Override res.json to inspect outgoing payloads for cross-tenant leakage
    res.json = function (data) {
        try {
            const currentTenantId = String(req.tenant?._id || req.headers['x-tenant-id']);
            const payloadString = JSON.stringify(data);

            // Pattern for potential UUID/ObjectId leak detections
            // This is a simplified check; real forensic tools use entropy analysis
            if (payloadString.includes('tenantId') && !payloadString.includes(currentTenantId)) {
                telemetryAggregator.recordEvent({
                    type: 'security',
                    action: 'CROSS_TENANT_LEAK_DETECTED',
                    severity: 'critical',
                    tenantId: req.tenant?._id,
                    userId: req.user?._id,
                    path: req.path,
                    metadata: {
                        expectedTenant: currentTenantId,
                        detectionType: 'outbound_inspection'
                    }
                });

                logger.error('CRITICAL: Cross-tenant data leakage detected in middleware', {
                    userId: req.user?._id,
                    path: req.path
                });
            }
        } catch (err) {
            // Failure in monitor shouldn't block the response
        }

        return originalJson.call(this, data);
    };

    next();
};

module.exports = leakageMonitor;
