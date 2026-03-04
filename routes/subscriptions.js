const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { validateSubscription, validateForecast } = require('../middleware/subscriptionValidator');
const subscriptionService = require('../services/subscriptionService');

/**
 * @route   POST /api/subscriptions
 * @desc    Create a new predictive subscription
 */
router.post('/', auth, validateSubscription, async (req, res) => {
    try {
        const subscription = await subscriptionService.create(req.user._id, req.body);
        res.status(201).json({ success: true, data: subscription });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/subscriptions/forecast
 * @desc    Get predictive cash-flow impact for subscriptions
 */
router.get('/forecast', auth, validateForecast, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const forecast = await subscriptionService.getForecast(req.user._id, days);
        res.json({ success: true, data: forecast });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/subscriptions/audit
 * @desc    Get subscription health audit (unused/high-impact/trials)
 */
router.get('/audit', auth, async (req, res) => {
    try {
        const audit = await subscriptionService.getAudit(req.user._id);
        res.json({ success: true, data: audit });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/subscriptions/detect-patterns
 * @desc    Intelligently detect potential subscriptions from history
 */
router.get('/detect-patterns', auth, async (req, res) => {
    try {
        const patterns = await subscriptionService.detectNewSubscriptions(req.user._id);
        res.json({ success: true, count: patterns.length, data: patterns });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/subscriptions/:id/transition
 * @desc    Manually transition subscription state
 */
router.post('/:id/transition', auth, async (req, res) => {
    try {
        const { status, note } = req.body;
        const sub = await require('../models/Subscription').findOne({ _id: req.params.id, user: req.user._id });
        if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });

        sub.transitionTo(status, note);
        await sub.save();
        res.json({ success: true, data: sub });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/subscriptions/trigger-renewals
 * @desc    Admin: Manually trigger renewal processing for all users
 */
router.post('/trigger-renewals', auth, async (req, res) => {
    try {
        // In real app, restrict to admins
        const results = await subscriptionService.processDueRenewals();
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
