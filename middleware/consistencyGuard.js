const ConsensusService = require('../services/consensusService');
const mongoose = require('mongoose');

/**
 * Consistency Guard Middleware
 * Issue #705: Intercepts sync updates to prevent out-of-order state mutations.
 */
const consistencyGuard = async (req, res, next) => {
    // Only intercept PUT/PATCH requests that look like sync updates
    if (!['PUT', 'PATCH'].includes(req.method) || !req.body.vectorClock) {
        return next();
    }

    try {
        const { modelName, id } = req.params; // Expecting routes like /api/sync/:modelName/:id
        if (!modelName || !id) return next();

        const Model = mongoose.model(modelName);
        const entity = await Model.findById(id);

        if (!entity) return next();

        const deviceId = req.headers['x-device-id'] || 'unknown';
        const userId = req.user._id;

        const result = await ConsensusService.reconcile(entity, req.body, deviceId, userId);

        if (result.action === 'ignore') {
            return res.status(409).json({
                success: false,
                error: 'Stale update rejected.',
                reason: result.reason
            });
        }

        if (result.action === 'conflict') {
            return res.status(409).json({
                success: false,
                error: 'Version conflict detected.',
                conflictId: result.conflictId,
                fields: result.conflictingFields
            });
        }

        // Action is 'update', modify request body to the merged state and proceed
        req.body = result.data;
        req.body.vectorClock = result.clock;

        next();
    } catch (error) {
        console.error('[ConsistencyGuard] Error:', error);
        res.status(500).json({ success: false, error: 'Distributed consensus failure.' });
    }
};

module.exports = consistencyGuard;
