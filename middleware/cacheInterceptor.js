const multiTierCache = require('../utils/multiTierCache');
const Workspace = require('../models/Workspace');
const CacheMap = require('../models/CacheMap');

/**
 * Cache Interceptor Middleware
 * Issue #781: JIT hydration of cached financial snapshots
 */
const cacheInterceptor = (ttlSeconds = 300) => {
    return async (req, res, next) => {
        if (req.method !== 'GET') return next();

        // Admin override matching the #781 spec "Skip-Cache administrativa overrides"
        if (req.headers['x-skip-cache'] === 'true') return next();

        const workspaceId = req.headers['x-workspace-id'] || (req.user ? req.user.activeWorkspace : null);
        if (!workspaceId) return next();

        try {
            // Find current epoch. If bumped, old cache is ignored by key mismatch
            const workspace = await Workspace.findById(workspaceId).select('epochSequence');
            const epoch = workspace ? (workspace.epochSequence || 0) : 0;

            // Build Graph-Aware Epoch-Linked Key
            const cacheKey = `${req.originalUrl || req.url}|epoch:${epoch}|ws:${workspaceId}`;

            const cachedBody = await multiTierCache.get(cacheKey);
            if (cachedBody) {
                res.setHeader('X-Cache', 'HIT');
                res.setHeader('X-Cache-Epoch', epoch);
                return res.json(cachedBody);
            }

            res.setHeader('X-Cache', 'MISS');

            // Patch res.json to capture response
            const originalJson = res.json;
            res.json = function (body) {
                // Restore original method
                res.json = originalJson;

                // Fire async to populate cache layer
                multiTierCache.set(cacheKey, body, ttlSeconds).catch(console.error);

                // Build a dependency map so it can be pruned if space is needed or it expires
                CacheMap.create({
                    workspaceId,
                    cacheKey,
                    dependentEntities: [`REQUEST:${req.originalUrl}`],
                    epochSequence: epoch,
                    expiresAt: new Date(Date.now() + (ttlSeconds * 1000))
                }).catch(console.error);

                return originalJson.call(this, body);
            };

            next();
        } catch (err) {
            console.error('[CacheInterceptor] Error:', err);
            next(); // Fail gracefully
        }
    };
};

module.exports = cacheInterceptor;
