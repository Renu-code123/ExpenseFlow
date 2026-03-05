const Workspace = require('../models/Workspace');

/**
 * Cache Sync Middleware
 * Issue #741: Injects cache versions (Epochs) into requests.
 * Ensures consistent read-your-writes behavior.
 */

const cacheSync = async (req, res, next) => {
    try {
        const workspaceId = req.headers['x-workspace-id'] || req.query.workspaceId;

        if (workspaceId) {
            const workspace = await Workspace.findById(workspaceId).select('cacheEpoch');

            // Attach cache context to request
            req.cacheContext = {
                workspaceId,
                epoch: workspace ? workspace.cacheEpoch : 0,
                generateKey: (prefix) => `${prefix}:${workspaceId}:v${workspace ? workspace.cacheEpoch : 0}`
            };
        }

        next();
    } catch (err) {
        console.error('[CacheSync Middleware Error]:', err);
        next(); // Don't block request on cache metadata failure
    }
};

module.exports = cacheSync;
