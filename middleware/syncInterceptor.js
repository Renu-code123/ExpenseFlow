const syncManager = require('../services/syncManager');

/**
 * Sync Interceptor Middleware
 * Issue #660: Automatically hooks into POST/PUT/DELETE requests to log mutations
 */
const syncInterceptor = async (req, res, next) => {
    // Only capture mutations targeting supported syncing entities
    const syncableRoutes = ['/api/expenses', '/api/budgets', '/api/workspaces'];
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

    if (!isMutation || !syncableRoutes.some(route => req.originalUrl.startsWith(route))) {
        return next();
    }

    const deviceId = req.headers['x-device-id'] || 'web-default';

    // Intercept response to log success mutations
    const originalJson = res.json;
    res.json = function (data) {
        if ((res.statusCode === 200 || res.statusCode === 201) && data.success && data.data) {
            // Asynchronously log the mutation
            const operation = req.method === 'POST' ? 'CREATE' : (req.method === 'DELETE' ? 'DELETE' : 'UPDATE');

            // Handle both single objects and arrays
            const entities = Array.isArray(data.data) ? data.data : [data.data];

            entities.forEach(entity => {
                syncManager.logMutation(
                    req.user._id,
                    deviceId,
                    entity,
                    operation,
                    req.body
                ).catch(err => console.error('[SyncInterceptor] Log failed:', err));
            });
        }
        return originalJson.call(this, data);
    };

    next();
};

module.exports = syncInterceptor;
