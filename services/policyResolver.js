const PolicyNode = require('../models/PolicyNode');

/**
 * Policy Resolver Service
 * Issue #757: Recursive engine to determine final policy state by 
 * traversing the inheritance tree (Global -> Tenant -> Workspace).
 */
class PolicyResolver {
    /**
     * Resolve an effective policy for a workspace
     */
    async resolveEffectivePolicy(workspaceId, tenantId) {
        // 1. Fetch all nodes in the hierarchy
        const [globalPolicy, tenantPolicy, workspacePolicy] = await Promise.all([
            PolicyNode.findOne({ level: 'global', isActive: true }),
            PolicyNode.findOne({ level: 'tenant', targetId: tenantId, isActive: true }),
            PolicyNode.findOne({ level: 'workspace', targetId: workspaceId, isActive: true })
        ]);

        // 2. Merge logic: Workspace > Tenant > Global
        const mergedRules = new Map();

        // Fill in sequence (Bottom-up but applied Top-down for overriding)
        this._applyRulesToMap(mergedRules, globalPolicy?.rules || []);
        this._applyRulesToMap(mergedRules, tenantPolicy?.rules || []);
        this._applyRulesToMap(mergedRules, workspacePolicy?.rules || []);

        return {
            workspaceId,
            tenantId,
            effectiveRules: Array.from(mergedRules.values()),
            inheritanceChain: {
                global: !!globalPolicy,
                tenant: !!tenantPolicy,
                workspace: !!workspacePolicy
            },
            strictMode: workspacePolicy?.overrides?.strictMode || tenantPolicy?.overrides?.strictMode || false
        };
    }

    _applyRulesToMap(map, rules) {
        rules.forEach(rule => {
            // Overwrite previous rules for the same category
            map.set(rule.category, {
                ...rule.toObject ? rule.toObject() : rule,
                resolvedAt: new Date()
            });
        });
    }

    /**
     * Find the specific rule for a transaction
     */
    async getRuleForTransaction(transaction, workspaceId, tenantId) {
        const policy = await this.resolveEffectivePolicy(workspaceId, tenantId);

        // Find category match or default to a catch-all if exists
        return policy.effectiveRules.find(r => r.category === transaction.category) ||
            policy.effectiveRules.find(r => r.category === 'default');
    }
}

module.exports = new PolicyResolver();
