const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const SyncConflict = require('../models/SyncConflict');
const ConsensusService = require('../services/consensusService');
const mongoose = require('mongoose');

/**
 * Sync Manager Routes
 * Issue #705: API for managing distributed state and resolving conflicts.
 */

/**
 * @route   GET /api/sync/conflicts
 * @desc    Get all open conflicts for the user
 */
router.get('/conflicts', auth, async (req, res) => {
    try {
        const conflicts = await SyncConflict.find({
            userId: req.user._id,
            status: 'open'
        }).sort({ createdAt: -1 });
        res.json({ success: true, data: conflicts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   POST /api/sync/resolve/:conflictId
 * @desc    Manually resolve a conflict by providing a winner state
 */
router.post('/resolve/:conflictId', auth, async (req, res) => {
    try {
        const conflict = await SyncConflict.findOne({
            _id: req.params.conflictId,
            userId: req.user._id
        });

        if (!conflict) return res.status(404).json({ success: false, error: 'Conflict not found' });

        const { resolvedState } = req.body;
        const Model = mongoose.model(conflict.entityType);

        // Update the target entity
        const entity = await Model.findById(conflict.entityId);
        if (entity) {
            Object.assign(entity, resolvedState);
            // Increment clock globally for this resolution
            entity.vectorClock.set('SYSTEM_RESOLVER', (entity.vectorClock.get('SYSTEM_RESOLVER') || 0) + 1);
            await entity.save();
        }

        // Mark conflict as resolved
        conflict.status = 'resolved';
        conflict.resolvedState = resolvedState;
        conflict.resolvedAt = new Date();
        conflict.resolutionStrategy = 'manual';
        await conflict.save();

        res.json({ success: true, message: 'Conflict resolved successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
