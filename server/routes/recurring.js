const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { validateCreate, validateUpdate, validateObjectId } = require('../middleware/recurringValidator');
const recurringService = require('../services/recurringService');

/**
 * @route   POST /api/recurring
 * @desc    Create a new recurring expense
 * @access  Private
 */
router.post('/', auth, validateCreate, async (req, res) => {
    try {
        const recurring = await recurringService.create(req.user._id, req.validatedBody);

        // Emit real-time update
        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('recurring_created', recurring);

        res.status(201).json({
            success: true,
            message: 'Recurring expense created successfully',
            data: recurring
        });
    } catch (error) {
        console.error('[Recurring Routes] Create error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/recurring
 * @desc    Get all recurring expenses for authenticated user
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
    try {
        const includeInactive = req.query.includeInactive === 'true';
        const recurring = await recurringService.getAllForUser(req.user._id, includeInactive);

        res.json({
            success: true,
            count: recurring.length,
            data: recurring
        });
    } catch (error) {
        console.error('[Recurring Routes] Get all error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/recurring/statistics
 * @desc    Get recurring expense statistics
 * @access  Private
 */
router.get('/statistics', auth, async (req, res) => {
    try {
        const statistics = await recurringService.getStatistics(req.user._id);

        res.json({
            success: true,
            data: statistics
        });
    } catch (error) {
        console.error('[Recurring Routes] Statistics error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/recurring/upcoming
 * @desc    Get upcoming recurring expenses (next N days)
 * @access  Private
 */
router.get('/upcoming', auth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const upcoming = await recurringService.getUpcoming(req.user._id, days);

        res.json({
            success: true,
            count: upcoming.length,
            data: upcoming
        });
    } catch (error) {
        console.error('[Recurring Routes] Upcoming error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/recurring/monthly-total
 * @desc    Get total monthly recurring expense amount
 * @access  Private
 */
router.get('/monthly-total', auth, async (req, res) => {
    try {
        const total = await recurringService.getMonthlyTotal(req.user._id);

        res.json({
            success: true,
            data: {
                monthlyTotal: Math.round(total * 100) / 100
            }
        });
    } catch (error) {
        console.error('[Recurring Routes] Monthly total error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/recurring/:id
 * @desc    Get a single recurring expense by ID
 * @access  Private
 */
router.get('/:id', auth, validateObjectId, async (req, res) => {
    try {
        const recurring = await recurringService.getAllForUser(req.user._id, true);
        const found = recurring.find(r => r._id.toString() === req.params.id);

        if (!found) {
            return res.status(404).json({ error: 'Recurring expense not found' });
        }

        res.json({
            success: true,
            data: found
        });
    } catch (error) {
        console.error('[Recurring Routes] Get by ID error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   PUT /api/recurring/:id
 * @desc    Update a recurring expense
 * @access  Private
 */
router.put('/:id', auth, validateObjectId, validateUpdate, async (req, res) => {
    try {
        const recurring = await recurringService.update(
            req.params.id,
            req.user._id,
            req.validatedBody
        );

        // Emit real-time update
        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('recurring_updated', recurring);

        res.json({
            success: true,
            message: 'Recurring expense updated successfully',
            data: recurring
        });
    } catch (error) {
        console.error('[Recurring Routes] Update error:', error);
        if (error.message === 'Recurring expense not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   DELETE /api/recurring/:id
 * @desc    Deactivate a recurring expense
 * @access  Private
 */
router.delete('/:id', auth, validateObjectId, async (req, res) => {
    try {
        const permanent = req.query.permanent === 'true';

        let result;
        if (permanent) {
            result = await recurringService.permanentDelete(req.params.id, req.user._id);
        } else {
            result = await recurringService.delete(req.params.id, req.user._id);
        }

        // Emit real-time update
        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('recurring_deleted', { id: req.params.id, permanent });

        res.json({
            success: true,
            message: permanent ? 'Recurring expense permanently deleted' : 'Recurring expense deactivated',
            data: result
        });
    } catch (error) {
        console.error('[Recurring Routes] Delete error:', error);
        if (error.message === 'Recurring expense not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/recurring/:id/pause
 * @desc    Pause a recurring expense
 * @access  Private
 */
router.post('/:id/pause', auth, validateObjectId, async (req, res) => {
    try {
        const recurring = await recurringService.pause(req.params.id, req.user._id);

        // Emit real-time update
        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('recurring_updated', recurring);

        res.json({
            success: true,
            message: 'Recurring expense paused',
            data: recurring
        });
    } catch (error) {
        console.error('[Recurring Routes] Pause error:', error);
        if (error.message === 'Recurring expense not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/recurring/:id/resume
 * @desc    Resume a paused recurring expense
 * @access  Private
 */
router.post('/:id/resume', auth, validateObjectId, async (req, res) => {
    try {
        const recurring = await recurringService.resume(req.params.id, req.user._id);

        // Emit real-time update
        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('recurring_updated', recurring);

        res.json({
            success: true,
            message: 'Recurring expense resumed',
            data: recurring
        });
    } catch (error) {
        console.error('[Recurring Routes] Resume error:', error);
        if (error.message === 'Recurring expense not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/recurring/:id/skip
 * @desc    Skip the next occurrence of a recurring expense
 * @access  Private
 */
router.post('/:id/skip', auth, validateObjectId, async (req, res) => {
    try {
        const skipNow = req.query.immediate === 'true';

        let recurring;
        if (skipNow) {
            // Immediately skip and move to next date
            recurring = await recurringService.skipOccurrence(req.params.id, req.user._id);
        } else {
            // Mark to skip when next processed
            recurring = await recurringService.markSkipNext(req.params.id, req.user._id);
        }

        // Emit real-time update
        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('recurring_updated', recurring);

        res.json({
            success: true,
            message: skipNow ? 'Occurrence skipped, moved to next due date' : 'Next occurrence will be skipped',
            data: recurring
        });
    } catch (error) {
        console.error('[Recurring Routes] Skip error:', error);
        if (error.message === 'Recurring expense not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/recurring/:id/trigger
 * @desc    Manually trigger expense creation for a recurring expense
 * @access  Private
 */
router.post('/:id/trigger', auth, validateObjectId, async (req, res) => {
    try {
        const expense = await recurringService.triggerNow(req.params.id, req.user._id);

        // Emit real-time updates
        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('expense_created', expense);

        res.json({
            success: true,
            message: 'Expense created from recurring',
            data: expense
        });
    } catch (error) {
        console.error('[Recurring Routes] Trigger error:', error);
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
