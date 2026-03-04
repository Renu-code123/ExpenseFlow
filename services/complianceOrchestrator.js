const policyRepository = require('../repositories/policyRepository');
const predicateEngine = require('../utils/predicateEngine');
const diffGraph = require('../utils/diffGraph');
const logger = require('../utils/structuredLogger');

/**
 * Compliance Orchestrator
 * Issue #780: Central logic for policy evaluation chains against Circuit Breakers.
 */
class ComplianceOrchestrator {

    /**
     * Test an action against active workspace constraints.
     * Returns { allowed: boolean, reason?: string, action?: 'FLAG'|'FREEZE'|'DENY' }
     */
    async evaluate(workspaceId, resourceType, payload, contextData = {}) {
        if (!workspaceId) return { allowed: true };

        const paths = await diffGraph.getInvalidationPaths(workspaceId);
        const policies = await policyRepository.getInheritedPolicies(paths);

        // Filter pertinent policies
        const targets = policies.filter(p => p.targetResource === resourceType);
        if (targets.length === 0) return { allowed: true };

        const runtimeContext = {
            payload,
            ...contextData,
            timestamp: new Date()
        };

        for (const policy of targets) {
            try {
                // Return 'true' if the condition matches (A violation occurred)
                const isViolation = predicateEngine.evaluate(policy.conditions, runtimeContext);

                if (isViolation) {
                    logger.warn(`[Compliance Circuit] Breaker Tripped! Policy: ${policy.name}`);

                    return {
                        allowed: policy.action === 'NOTIFY' || policy.action === 'FLAG',
                        action: policy.action,
                        reason: `Policy Violation: ${policy.description || policy.name}`,
                        policyId: policy._id
                    };
                }
            } catch (err) {
                logger.error(`[Compliance Circuit] Evaluation Error on Policy ${policy._id}: ${err.message}`);
                // Fail-safe defaults to allowed, unless strictly required to fail-closed
                // For enterprise apps, you might prefer fail-closed for specific high-risk operations.
            }
        }

        return { allowed: true };
    }
}

module.exports = new ComplianceOrchestrator();
