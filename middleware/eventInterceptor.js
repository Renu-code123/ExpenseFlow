const eventProcessor = require('../services/eventProcessor');
const mongoose = require('mongoose');

/**
 * Event Interceptor Middleware
 * Issue #680: Automatically captures all state transitions and logs them as events.
 */
const eventInterceptor = async (req, res, next) => {
    // Supported models for event sourcing
    const syncableRoutes = {
        '/api/expenses': 'Transaction',
        '/api/workspaces': 'Workspace',
        '/api/budgets': 'Budget'
    };

    const route = Object.keys(syncableRoutes).find(r => req.originalUrl.startsWith(r));
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

    if (!isMutation || !route) {
        return next();
    }

    const modelName = syncableRoutes[route];
    let oldState = null;

    // Capture old state for updates
    if (['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const id = req.params.id || req.body.id;
        if (id && mongoose.Types.ObjectId.isValid(id)) {
            try {
                const Model = mongoose.model(modelName);
                oldState = await Model.findById(id).lean();
            } catch (err) {
                console.error('[EventInterceptor] Failed to capture pre-state:', err);
            }
        }
    }

    const originalJson = res.json;
    res.json = function (data) {
        if ((res.statusCode === 200 || res.statusCode === 201) && data.success && data.data) {
            const eventType = req.method === 'POST' ? 'TX_CREATED' : (req.method === 'DELETE' ? 'TX_DELETED' : 'TX_UPDATED');

            // Asynchronously process the event
            const entityData = Array.isArray(data.data) ? data.data[0] : data.data;
            const entity = {
                _id: entityData._id,
                constructor: { modelName },
                toObject: () => entityData
            };

            eventProcessor.logEvent(
                req.user._id,
                eventType,
                entity,
                oldState,
                {
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    deviceId: req.headers['x-device-id']
                }
            ).catch(err => console.error('[EventInterceptor] Async log failed:', err));
        }
        return originalJson.call(this, data);
    };

    next();
};

module.exports = eventInterceptor;
