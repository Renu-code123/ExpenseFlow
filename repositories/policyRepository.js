const BaseRepository = require('./baseRepository');
const PolicyNode = require('../models/PolicyNode');

/**
 * Policy Repository
 * Issue #780: Optimized access for inherited rules.
 */
class PolicyRepository extends BaseRepository {
    constructor() {
        super(PolicyNode);
    }

    /**
     * Retrieve active policies for a workspace and its ancestors.
     */
    async getInheritedPolicies(paths) {
        return await PolicyNode.find({
            workspaceId: { $in: paths },
            isActive: true,
            $or: [
                { workspaceId: paths[0] }, // Direct rules
                { isInheritable: true }    // Ancestor inheritable rules
            ]
        }).sort({ priority: -1 }).lean();
    }

    /**
     * Issue #961: Dynamic policy injection for jurisdictional context.
     * Fetches the PolicyNode bound to a specific tax jurisdiction code.
     * Called by NexusSwitchgear to mount the correct legal gate.
     * @param {string} jurisdictionCode - e.g., 'IN', 'US-CA'
     * @returns {Object|null} PolicyNode
     */
    async getByJurisdiction(jurisdictionCode) {
        return await PolicyNode.findOne({
            jurisdictionCode,
            isActive: true
        }).lean();
    }

    /**
     * Issue #961: Inject a jurisdiction-specific policy into a workspace evaluation context.
     * Merges the global jurisdictional constraint with the workspace's inherited policies.
     */
    async getInheritedWithJurisdiction(paths, jurisdictionCode) {
        const [inherited, jurisdictional] = await Promise.all([
            this.getInheritedPolicies(paths),
            jurisdictionCode ? this.getByJurisdiction(jurisdictionCode) : null
        ]);

        if (jurisdictional) {
            // Jurisdictional policy takes highest priority
            return [{ ...jurisdictional, priority: 9999 }, ...inherited];
        }
        return inherited;
    }
}

module.exports = new PolicyRepository();
