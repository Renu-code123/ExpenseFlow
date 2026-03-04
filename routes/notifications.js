const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const notificationGuard = require('../middleware/notificationGuard');
const orchestrator = require('../services/notificationOrchestrator');
const NotificationTemplate = require('../models/NotificationTemplate');

/**
 * Notification Management API
 * Issue #721: Endpoints for triggering alerts and managing templates.
 */

/**
 * @route   POST /api/notifications/dispatch
 * @desc    Manually trigger a notification (Admin/System use)
 */
router.post('/dispatch', auth, notificationGuard, async (req, res) => {
  const { slug, variables, options } = req.body;

  if (!slug) {
    return res.status(400).json({ success: false, error: 'Slug is required' });
  }

  const result = await orchestrator.dispatch(slug, req.user._id, variables, options);

  if (!result.success) {
    return res.status(500).json(result);
  }

  res.json(result);
});

/**
 * @route   GET /api/notifications/templates
 * @desc    List active notification templates
 */
router.get('/templates', auth, async (req, res) => {
  try {
    const templates = await NotificationTemplate.find({ isActive: true })
      .select('slug name description category');
    res.json({ success: true, data: templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;