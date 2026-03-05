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
     * Issue #961: Now accepts jurisdictionCode in contextData for dynamic policy mounting.
     */
    async evaluate(workspaceId, resourceType, payload, contextData = {}) {
        if (!workspaceId) return { allowed: true };

        const paths = await diffGraph.getInvalidationPaths(workspaceId);
        // Issue #961: Use jurisdiction-aware policy retrieval
        const jurisdictionCode = contextData.jurisdictionCode || null;
        const policies = await policyRepository.getInheritedWithJurisdiction(paths, jurisdictionCode);

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
                        policyId: policy._id,
                        jurisdictionCode
                    };
                }
            } catch (err) {
                logger.error(`[Compliance Circuit] Evaluation Error on Policy ${policy._id}: ${err.message}`);
            }
        }

        return { allowed: true, jurisdictionCode };
    }
}

module.exports = new ComplianceOrchestrator();
