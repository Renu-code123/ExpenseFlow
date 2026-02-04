const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ReminderService = require('../services/billReminderService');
const ReminderSchedule = require('../models/ReminderSchedule');

/**
 * @route   GET /api/reminders
 * @desc    Get all reminders
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
    try {
        const { status, type } = req.query;
        
        const filter = { user: req.user.userId };
        
        if (status) filter.status = status;
        if (type) filter.reminder_type = type;
        
        const reminders = await ReminderSchedule.find(filter)
            .sort({ scheduled_date: 1 });
        
        res.json({
            success: true,
            count: reminders.length,
            data: reminders
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/reminders/pending
 * @desc    Get pending reminders
 * @access  Private
 */
router.get('/pending', auth, async (req, res) => {
    try {
        const reminders = await ReminderSchedule.find({
            user: req.user.userId,
            status: 'pending'
        }).sort({ scheduled_date: 1 });
        
        res.json({
            success: true,
            count: reminders.length,
            data: reminders
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/reminders/settings
 * @desc    Get user reminder settings
 * @access  Private
 */
router.get('/settings', auth, async (req, res) => {
    try {
        const settings = await ReminderService.getReminderSettings(req.user.userId);
        
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/reminders/settings
 * @desc    Update reminder settings
 * @access  Private
 */
router.put('/settings', auth, async (req, res) => {
    try {
        const settings = await ReminderService.updateReminderSettings(
            req.user.userId,
            req.body
        );
        
        res.json({
            success: true,
            data: settings,
            message: 'Reminder settings updated successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/reminders/:id/cancel
 * @desc    Cancel a reminder
 * @access  Private
 */
router.post('/:id/cancel', auth, async (req, res) => {
    try {
        const reminder = await ReminderSchedule.findOne({
            _id: req.params.id,
            user: req.user.userId
        });
        
        if (!reminder) {
            return res.status(404).json({
                success: false,
                error: 'Reminder not found'
            });
        }
        
        await reminder.cancel();
        
        res.json({
            success: true,
            data: reminder,
            message: 'Reminder cancelled successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/reminders/:id/retry
 * @desc    Retry a failed reminder
 * @access  Private
 */
router.post('/:id/retry', auth, async (req, res) => {
    try {
        const reminder = await ReminderSchedule.findOne({
            _id: req.params.id,
            user: req.user.userId
        });
        
        if (!reminder) {
            return res.status(404).json({
                success: false,
                error: 'Reminder not found'
            });
        }
        
        if (reminder.status !== 'failed') {
            return res.status(400).json({
                success: false,
                error: 'Only failed reminders can be retried'
            });
        }
        
        reminder.status = 'pending';
        reminder.retry_count = (reminder.retry_count || 0) + 1;
        await reminder.save();
        
        // Attempt to send immediately
        await ReminderService.sendReminder(reminder);
        await reminder.markAsSent();
        
        res.json({
            success: true,
            data: reminder,
            message: 'Reminder sent successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
