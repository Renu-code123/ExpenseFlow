const express = require('express');
const auth = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const { Notification, NotificationPreferences } = require('../models/Notification');
const Joi = require('joi');
const router = express.Router();

// Validation schemas
const preferencesSchema = Joi.object({
  channels: Joi.object({
    email: Joi.object({
      enabled: Joi.boolean(),
      types: Joi.array().items(Joi.string().valid('budget_alert', 'goal_achieved', 'expense_added', 'security_alert', 'system'))
    }),
    push: Joi.object({
      enabled: Joi.boolean(),
      subscription: Joi.object(),
      types: Joi.array().items(Joi.string().valid('budget_alert', 'goal_achieved', 'expense_added', 'security_alert', 'system'))
    }),
    sms: Joi.object({
      enabled: Joi.boolean(),
      phoneNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/),
      types: Joi.array().items(Joi.string().valid('budget_alert', 'security_alert', 'system'))
    }),
    webhook: Joi.object({
      enabled: Joi.boolean(),
      url: Joi.string().uri(),
      secret: Joi.string(),
      types: Joi.array().items(Joi.string().valid('budget_alert', 'goal_achieved', 'expense_added', 'security_alert', 'system'))
    })
  }),
  quietHours: Joi.object({
    enabled: Joi.boolean(),
    start: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    end: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    timezone: Joi.string()
  }),
  frequency: Joi.object({
    budget_alerts: Joi.string().valid('immediate', 'daily', 'weekly'),
    goal_updates: Joi.string().valid('immediate', 'daily', 'weekly'),
    expense_summaries: Joi.string().valid('daily', 'weekly', 'monthly')
  })
});

// Get user notifications
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    
    const result = await notificationService.getUserNotifications(req.user._id, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true'
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unread count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user._id,
      read: false
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.user._id);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all notifications as read
router.patch('/mark-all-read', auth, async (req, res) => {
  try {
    await notificationService.markAllAsRead(req.user._id);
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete notification
router.delete('/:id', auth, async (req, res) => {
  try {
    await notificationService.deleteNotification(req.params.id, req.user._id);
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send test notification
router.post('/test', auth, async (req, res) => {
  try {
    const { type = 'system', title = 'Test Notification', message = 'This is a test notification from ExpenseFlow.' } = req.body;

    await notificationService.sendNotification(req.user._id, {
      title,
      message,
      type,
      priority: 'medium',
      data: { test: true, timestamp: new Date().toISOString() }
    });

    res.json({ message: 'Test notification sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get notification preferences
router.get('/preferences', auth, async (req, res) => {
  try {
    let preferences = await NotificationPreferences.findOne({ user: req.user._id });
    
    if (!preferences) {
      preferences = await notificationService.createDefaultPreferences(req.user._id);
    }

    res.json(preferences);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update notification preferences
router.put('/preferences', auth, async (req, res) => {
  try {
    const { error, value } = preferencesSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    let preferences = await NotificationPreferences.findOneAndUpdate(
      { user: req.user._id },
      value,
      { new: true, upsert: true }
    );

    res.json(preferences);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Subscribe to push notifications
router.post('/push/subscribe', auth, async (req, res) => {
  try {
    const { subscription } = req.body;
    
    if (!subscription) {
      return res.status(400).json({ error: 'Subscription data required' });
    }

    await NotificationPreferences.findOneAndUpdate(
      { user: req.user._id },
      { 
        'channels.push.subscription': subscription,
        'channels.push.enabled': true
      },
      { upsert: true }
    );

    res.json({ message: 'Push subscription saved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unsubscribe from push notifications
router.post('/push/unsubscribe', auth, async (req, res) => {
  try {
    await NotificationPreferences.findOneAndUpdate(
      { user: req.user._id },
      { 
        'channels.push.subscription': null,
        'channels.push.enabled': false
      }
    );

    res.json({ message: 'Push subscription removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get VAPID public key for push notifications
router.get('/push/vapid-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

module.exports = router;