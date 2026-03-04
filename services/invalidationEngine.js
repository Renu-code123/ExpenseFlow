const Workspace = require('../models/Workspace');
const CacheMap = require('../models/CacheMap');
const multiTierCache = require('../utils/multiTierCache');
const diffGraph = require('../utils/diffGraph');

/**
 * Invalidation Engine
 * Issue #781: Propagation logic for cross-tenant cache clearing.
 * Real-time Fiscal Graph Invalidation via Epoch Bumping.
 */
class InvalidationEngine {

    /**
     * Bump the cache epoch for a specific entity or workspace.
     * Triggers invalidation of dependents up the graph hierarchy.
     */
    async invalidateGraph(workspaceId) {
        if (!workspaceId) return;

        // Find all workspaces up the hierarchy that need clearing
        const paths = await diffGraph.getInvalidationPaths(workspaceId);

        for (const wsId of paths) {
            // 1. Bump Workspace Epoch Sequence
            const ws = await Workspace.findById(wsId);
            if (ws) {
                ws.epochSequence = (ws.epochSequence || 0) + 1;
                await ws.save();
            }

            // 2. Clear immediate L1/L2 Cache matching this workspace ID
            await multiTierCache.flushNode(wsId);

            // 3. Optional: Mark CacheMaps as expired immediately instead of waiting for prune Job
            await CacheMap.deleteMany({ workspaceId: wsId });
        }
    }
}

module.exports = new InvalidationEngine();
