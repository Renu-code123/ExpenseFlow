const complianceOrchestrator = require('../services/complianceOrchestrator');
const ResponseFactory = require('../utils/ResponseFactory');

/**
 * Compliance Guard Middleware
 * Issue #780: Blocking HTTP routes that violate predefined workspace policies
 */
const complianceGuard = (resourceType) => {
    return async (req, res, next) => {
        try {
            // Bypass read-only operations
            if (['GET', 'OPTIONS', 'HEAD'].includes(req.method)) {
                return next();
            }

            const workspaceId = req.headers['x-workspace-id'] || (req.user ? req.user.activeWorkspace : null);
            if (!workspaceId) return next();

            const contextData = {
                user: req.user,
                ip: req.ip,
                method: req.method,
                time: new Date()
            };

            const evaluation = await complianceOrchestrator.evaluate(
                workspaceId,
                resourceType,
                req.body,
                contextData
            );

            // Circuit Breaker tripped
            if (!evaluation.allowed && ['DENY', 'FREEZE'].includes(evaluation.action)) {
                if (evaluation.action === 'FREEZE') {
                    // Could dispatch background job to suspend Workspace account
                    console.log(`[CircuitBreaker] Workspace ${workspaceId} FROZEN by policy ${evaluation.policyId}`);
                }

                return ResponseFactory.error(
                    res,
                    403,
                    `Compliance Policy Violation: Transaction blocked by circuit breaker. Reason: ${evaluation.reason}`
                );
            }

            if (evaluation.action === 'FLAG') {
                // Attach forensic flag to request so down-stream handlers can act
                req.complianceFlag = evaluation.policyId;
                console.log(`[CircuitBreaker] Workspace ${workspaceId} FLAGGED operation via policy ${evaluation.policyId}`);
            }

            next();
        } catch (error) {
            console.error('[ComplianceGuard] Error evaluating policies:', error);
            // Default open to avoid blocking legitimate traffic on error, unless strict mode needed
            next();
        }
    };
};

module.exports = complianceGuard;
