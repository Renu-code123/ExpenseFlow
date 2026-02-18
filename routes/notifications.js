const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const NotificationPreference = require('../models/NotificationPreference');

/**
 * @route   GET /api/notifications
 * @desc    Get user notification history
 */
router.get('/', auth, async (req, res) => {
  try {
    const history = await notificationService.getHistory(req.user._id, req.query);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/notifications/:id/read
 * @desc    Mark notification as read
 */
router.post('/:id/read', auth, async (req, res) => {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.user._id);
    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/notifications/read-all
 * @desc    Mark all notifications as read
 */
router.post('/read-all', auth, async (req, res) => {
  try {
    await notificationService.markAllRead(req.user._id);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/notifications/preferences
 * @desc    Get notification preferences
 */
router.get('/preferences', auth, async (req, res) => {
  try {
    let preferences = await NotificationPreference.findOne({ userId: req.user._id });
    if (!preferences) {
      preferences = await NotificationPreference.create({ userId: req.user._id });
    }
    res.json({ success: true, data: preferences });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   PATCH /api/notifications/preferences
 * @desc    Update notification preferences
 */
router.patch('/preferences', auth, async (req, res) => {
  try {
    const preferences = await NotificationPreference.findOneAndUpdate(
      { userId: req.user._id },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.json({ success: true, data: preferences });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;