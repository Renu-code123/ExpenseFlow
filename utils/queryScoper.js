const mongoose = require('mongoose');

/**
 * Query Scoper Utility
 * Issue #729: Intercepts Mongoose queries to inject workspaceId automatically.
 * Ensures data isolation at the ORM level.
 */

class QueryScoper {
    /**
     * Injects workspaceId filter into a query object
     * @param {Object} query - The Mongoose query filter object
     * @param {string|ObjectId} workspaceId - The tenant identifier
     */
    apply(query, workspaceId) {
        if (!workspaceId) return query;

        // If it's a find/update/delete filter
        if (typeof query === 'object') {
            // Prevent workspaceId override if already present and different
            if (query.workspace && query.workspace.toString() !== workspaceId.toString()) {
                throw new Error('Tenant Violation: Attempted to access foreign workspace data');
            }
            query.workspace = workspaceId;
        }

        return query;
    }

    /**
     * Wraps standard Mongoose find to always include workspace context
     */
    scopedFind(Model, workspaceId, filter = {}) {
        const scopedFilter = this.apply({ ...filter }, workspaceId);
        return Model.find(scopedFilter);
    }

    /**
     * Validates that an entity belongs to a specific workspace
     */
    async validateOwnership(Model, entityId, workspaceId) {
        const doc = await Model.findOne({ _id: entityId, workspace: workspaceId });
        if (!doc) {
            throw new Error(`Access Denied: Resource ${entityId} does not belong to Workspace ${workspaceId}`);
        }
        return doc;
    }
}

module.exports = new QueryScoper();
