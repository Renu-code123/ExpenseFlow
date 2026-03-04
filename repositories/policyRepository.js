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
}

module.exports = new PolicyRepository();
