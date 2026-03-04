const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const WriteJournal = require('../models/WriteJournal');
const ResponseFactory = require('../utils/responseFactory');
const mongoose = require('mongoose');

/**
 * Conflict Resolution Routes
 * Issue #769: API for manual resolution of unresolvable writes.
 */

/**
 * @route   GET /api/conflicts
 * @desc    Get all unresolved conflicts for the current workspace
 */
router.get('/', auth, async (req, res) => {
    try {
        const workspaceId = req.headers['x-workspace-id'] || req.user.activeWorkspace;
        const conflicts = await WriteJournal.find({
            workspaceId,
            status: 'CONFLICT'
        }).sort({ createdAt: -1 });

        return ResponseFactory.success(res, conflicts);
    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   POST /api/conflicts/:id/resolve
 * @desc    Manually resolve a conflict by choosing a payload
 */
router.post('/:id/resolve', auth, async (req, res) => {
    try {
        const journal = await WriteJournal.findById(req.params.id);
        if (!journal) return ResponseFactory.error(res, 404, 'Conflict record not found');

        const { resolution, customPayload } = req.body; // 'USE_JOURNAL', 'USE_CURRENT', 'CUSTOM'

        const modelName = journal.entityType.charAt(0) + journal.entityType.slice(1).toLowerCase();
        const Model = mongoose.model(modelName);
        const entity = await Model.findById(journal.entityId);

        if (resolution === 'USE_JOURNAL') {
            if (entity) {
                Object.assign(entity, journal.payload);
                entity.vectorClock = journal.vectorClock;
                await entity.save();
            } else if (journal.operation === 'CREATE') {
                await Model.create({ ...journal.payload, _id: journal.entityId, vectorClock: journal.vectorClock });
            }
        } else if (resolution === 'CUSTOM') {
            if (entity) {
                Object.assign(entity, customPayload);
                // Merge clocks or reset? For custom, we usually bump the server clock
                await entity.save();
            }
        }

        journal.status = 'APPLIED';
        journal.appliedAt = new Date();
        await journal.save();

        return ResponseFactory.success(res, { message: 'Conflict resolved successfully' });
    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

module.exports = router;
