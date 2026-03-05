/**
 * DiffGraph Utility
 * Issue #781: Calculating dependency paths in workspace hierarchies.
 * Issue #796: Extended with semantic index invalidation for workspace graph changes.
 */
class DiffGraph {
    /**
     * Compute path of ancestors to invalidate recursively
     * E.g., Team -> Dept -> Company
     */
    static async getInvalidationPaths(startWorkspaceId) {
        if (!startWorkspaceId) return [];
        const Workspace = require('../models/Workspace');
        const paths = [startWorkspaceId.toString()];
        let currentId = startWorkspaceId;

        while (currentId) {
            const ws = await Workspace.findById(currentId).select('parentWorkspaceId');
            if (ws && ws.parentWorkspaceId) {
                paths.push(ws.parentWorkspaceId.toString());
                currentId = ws.parentWorkspaceId;
            } else {
                currentId = null;
            }
        }

        return paths;
    }

    /**
     * Issue #796: Propagate semantic index invalidation through workspace graph.
     * When workspace hierarchy changes, semantic embeddings may need re-indexing
     * to maintain cross-workspace relevance and context accuracy.
     * @param {ObjectId} workspaceId - The workspace where change originated
     * @param {string} changeType - Type of change: 'hierarchy', 'membership', 'settings', 'entities'
     * @returns {Promise<Array>} List of workspace IDs whose semantic indexes need refresh
     */
    static async getSemanticInvalidationScope(workspaceId, changeType = 'entities') {
        if (!workspaceId) return [];
        
        const Workspace = require('../models/Workspace');
        const affectedWorkspaces = new Set();
        affectedWorkspaces.add(workspaceId.toString());

        // For hierarchy changes, invalidate parent chain (context inheritance)
        if (['hierarchy', 'settings'].includes(changeType)) {
            const ancestorPaths = await this.getInvalidationPaths(workspaceId);
            ancestorPaths.forEach(id => affectedWorkspaces.add(id));
        }

        // For membership changes, also check child workspaces (cascading re-index)
        if (['hierarchy', 'membership'].includes(changeType)) {
            const children = await Workspace.find({
                parentWorkspaceId: workspaceId,
                status: 'active'
            }).select('_id');
            children.forEach(child => affectedWorkspaces.add(child._id.toString()));
        }

        return Array.from(affectedWorkspaces);
    }

    /**
     * Issue #796: Mark workspaces for semantic re-indexing.
     * Updates cluster health and flags workspaces for neural reindexer job.
     * @param {Array<ObjectId>} workspaceIds - Workspaces to mark for reindexing
     * @param {string} reason - Reason for reindex: 'hierarchyChange', 'feedbackAccumulated', 'scheduled', 'manual'
     * @returns {Promise<number>} Count of workspaces marked
     */
    static async markForSemanticReindex(workspaceIds, reason = 'hierarchyChange') {
        if (!workspaceIds || workspaceIds.length === 0) return 0;
        
        const Workspace = require('../models/Workspace');
        
        const result = await Workspace.updateMany(
            { 
                _id: { $in: workspaceIds },
                status: 'active'
            },
            {
                $set: {
                    'semanticCluster.clusterHealth': 'NEEDS_REINDEX',
                    'semanticCluster.reindexReason': reason,
                    'semanticCluster.reindexQueuedAt': new Date()
                }
            }
        );

        return result.modifiedCount || 0;
    }

    /**
     * Issue #796: Invalidate semantic indexes for entities within affected workspaces.
     * Called when parent workspace relationships change and embeddings may be stale.
     * @param {Array<ObjectId>} workspaceIds - Workspaces whose entity embeddings to invalidate
     * @returns {Promise<number>} Count of embeddings marked stale
     */
    static async invalidateSemanticEmbeddings(workspaceIds) {
        if (!workspaceIds || workspaceIds.length === 0) return 0;

        try {
            const SemanticIndex = require('../models/SemanticIndex');
            
            const result = await SemanticIndex.updateMany(
                {
                    workspace: { $in: workspaceIds },
                    status: 'active'
                },
                {
                    $set: {
                        status: 'stale',
                        staleSince: new Date(),
                        staleReason: 'workspace_graph_change'
                    }
                }
            );

            return result.modifiedCount || 0;
        } catch (error) {
            // SemanticIndex may not exist yet during initial setup
            console.warn('[DiffGraph] Could not invalidate semantic embeddings:', error.message);
            return 0;
        }
    }

    /**
     * Issue #796: Get workspaces with stale semantic clusters for batch reprocessing.
     * Used by neuralReindexer job to find work to do.
     * @param {number} limit - Maximum workspaces to return
     * @returns {Promise<Array>} Workspaces with stale semantic data
     */
    static async getStaleSemanticWorkspaces(limit = 50) {
        const Workspace = require('../models/Workspace');
        
        return Workspace.find({
            status: 'active',
            $or: [
                { 'semanticCluster.clusterHealth': 'NEEDS_REINDEX' },
                { 'semanticCluster.clusterHealth': 'DEGRADED' },
                { 'semanticCluster.clusterHealth': 'STALE' }
            ]
        })
        .select('_id name semanticCluster')
        .sort({ 'semanticCluster.reindexQueuedAt': 1 })
        .limit(limit);
    }

    /**
     * Issue #796: Cascade semantic invalidation through entire workspace subtree.
     * Used when major structural changes occur (workspace deletion, merge, etc.)
     * @param {ObjectId} rootWorkspaceId - Root of subtree to invalidate
     * @returns {Promise<{workspacesAffected: number, embeddingsInvalidated: number}>}
     */
    static async cascadeSemanticInvalidation(rootWorkspaceId) {
        const Workspace = require('../models/Workspace');
        const allAffected = new Set();
        const queue = [rootWorkspaceId.toString()];

        // BFS traversal of workspace tree
        while (queue.length > 0) {
            const currentId = queue.shift();
            if (allAffected.has(currentId)) continue;
            allAffected.add(currentId);

            const children = await Workspace.find({
                parentWorkspaceId: currentId,
                status: { $in: ['active', 'archived'] }
            }).select('_id');

            children.forEach(child => queue.push(child._id.toString()));
        }

        const workspaceIds = Array.from(allAffected);
        const workspacesMarked = await this.markForSemanticReindex(workspaceIds, 'cascadeInvalidation');
        const embeddingsInvalidated = await this.invalidateSemanticEmbeddings(workspaceIds);

        return {
            workspacesAffected: workspacesMarked,
            embeddingsInvalidated
        };
    }
}

module.exports = DiffGraph;
