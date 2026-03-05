const logger = require('../utils/structuredLogger');

/**
 * Data Leakage Guard Middleware
 * Issue #729: Post-processing interceptor to ensure no data from foreign 
 * workspaces is leaked in the response JSON.
 */
const leakageGuard = (req, res, next) => {
    // We only apply this to tenant-scoped requests
    if (!req.tenant || !req.tenant.id) {
        return next();
    }

    const tenantId = req.tenant.id.toString();

    // Preserve original res.json
    const originalJson = res.json;

    res.json = function (data) {
        try {
            if (data && data.success !== false) {
                // Determine if we're dealing with a single object or an array of objects
                const dataToScan = data.data || data;

                if (Array.isArray(dataToScan)) {
                    // Filter out any item that has a 'workspace' property not matching the current tenant
                    const leakedItems = dataToScan.filter(item =>
                        item.workspace && item.workspace.toString() !== tenantId
                    );

                    if (leakedItems.length > 0) {
                        logger.error('CRITICAL: Data leakage detected and blocked!', {
                            tenantId,
                            leakedWorkspaceIds: [...new Set(leakedItems.map(i => i.workspace.toString()))],
                            path: req.originalUrl
                        });

                        // Sanitize the array
                        const sanitized = dataToScan.filter(item =>
                            !item.workspace || item.workspace.toString() === tenantId
                        );

                        if (data.data) data.data = sanitized;
                        else data = sanitized;
                    }
                } else if (typeof dataToScan === 'object' && dataToScan !== null) {
                    // Single object validation
                    if (dataToScan.workspace && dataToScan.workspace.toString() !== tenantId) {
                        logger.error('CRITICAL: Single object leakage blocked!', {
                            tenantId,
                            leakedWorkspaceId: dataToScan.workspace.toString(),
                            path: req.originalUrl
                        });
                        return originalJson.call(this, {
                            success: false,
                            error: 'Security Violation: Tenant mismatch detected.'
                        });
                    }
                }
            }
        } catch (err) {
            logger.error('[LeakageGuard] Inspection failure:', err.message);
        }

        return originalJson.call(this, data);
    };

    next();
};

module.exports = leakageGuard;
