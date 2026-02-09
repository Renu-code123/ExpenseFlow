const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { validateSubscriptionCreate, validateSubscriptionUpdate, validateObjectId } = require('../middleware/subscriptionValidator');
const subscriptionService = require('../services/subscriptionService');

/**
 * @route   POST /api/subscriptions
 * @desc    Create a new subscription
 * @access  Private
 */
router.post('/', auth, validateSubscriptionCreate, async (req, res) => {
    try {
        const subscription = await subscriptionService.create(req.user._id, req.validatedBody);

        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('subscription_created', subscription);

        res.status(201).json({
            success: true,
            message: 'Subscription created successfully',
            data: subscription
        });
    } catch (error) {
        console.error('[Subscriptions] Create error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/subscriptions
 * @desc    Get all subscriptions for user
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
    try {
        const { status, category, includeInactive } = req.query;
        const subscriptions = await subscriptionService.getAllForUser(req.user._id, {
            status,
            category,
            includeInactive: includeInactive === 'true'
        });

        res.json({
            success: true,
            count: subscriptions.length,
            data: subscriptions
        });
    } catch (error) {
        console.error('[Subscriptions] Get all error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/subscriptions/statistics
 * @desc    Get subscription statistics
 * @access  Private
 */
router.get('/statistics', auth, async (req, res) => {
    try {
        const statistics = await subscriptionService.getStatistics(req.user._id);

        res.json({
            success: true,
            data: statistics
        });
    } catch (error) {
        console.error('[Subscriptions] Statistics error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/subscriptions/upcoming
 * @desc    Get upcoming subscription payments
 * @access  Private
 */
router.get('/upcoming', auth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const upcoming = await subscriptionService.getUpcomingPayments(req.user._id, days);

        res.json({
            success: true,
            count: upcoming.length,
            data: upcoming
        });
    } catch (error) {
        console.error('[Subscriptions] Upcoming error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/subscriptions/unused
 * @desc    Get unused/underutilized subscriptions
 * @access  Private
 */
router.get('/unused', auth, async (req, res) => {
    try {
        const unused = await subscriptionService.getUnusedSubscriptions(req.user._id);

        res.json({
            success: true,
            count: unused.length,
            data: unused
        });
    } catch (error) {
        console.error('[Subscriptions] Unused error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/subscriptions/detect
 * @desc    Auto-detect subscriptions from expense history
 * @access  Private
 */
router.get('/detect', auth, async (req, res) => {
    try {
        const detected = await subscriptionService.detectSubscriptions(req.user._id);

        res.json({
            success: true,
            count: detected.length,
            data: detected
        });
    } catch (error) {
        console.error('[Subscriptions] Detection error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/subscriptions/detect/confirm
 * @desc    Create subscription from detected pattern
 * @access  Private
 */
router.post('/detect/confirm', auth, async (req, res) => {
    try {
        const subscription = await subscriptionService.createFromDetection(req.user._id, req.body);

        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('subscription_created', subscription);

        res.status(201).json({
            success: true,
            message: 'Subscription created from detection',
            data: subscription
        });
    } catch (error) {
        console.error('[Subscriptions] Confirm detection error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/subscriptions/export
 * @desc    Export all subscriptions
 * @access  Private
 */
router.get('/export', auth, async (req, res) => {
    try {
        const format = req.query.format || 'json';
        const data = await subscriptionService.exportSubscriptions(req.user._id, format);

        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=subscriptions.csv');
            return res.send(data);
        }

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('[Subscriptions] Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/subscriptions/:id
 * @desc    Get a single subscription
 * @access  Private
 */
router.get('/:id', auth, validateObjectId, async (req, res) => {
    try {
        const subscription = await subscriptionService.getById(req.params.id, req.user._id);

        if (!subscription) {
            return res.status(404).json({ error: 'Subscription not found' });
        }

        res.json({
            success: true,
            data: subscription
        });
    } catch (error) {
        console.error('[Subscriptions] Get by ID error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/subscriptions/:id/alternatives
 * @desc    Get cheaper alternatives for a subscription
 * @access  Private
 */
router.get('/:id/alternatives', auth, validateObjectId, async (req, res) => {
    try {
        const subscription = await subscriptionService.getById(req.params.id, req.user._id);

        if (!subscription) {
            return res.status(404).json({ error: 'Subscription not found' });
        }

        const alternatives = subscriptionService.getAlternatives(subscription);

        res.json({
            success: true,
            subscription: {
                name: subscription.name,
                category: subscription.category,
                monthlyAmount: subscription.monthlyAmount
            },
            alternatives
        });
    } catch (error) {
        console.error('[Subscriptions] Alternatives error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   PUT /api/subscriptions/:id
 * @desc    Update a subscription
 * @access  Private
 */
router.put('/:id', auth, validateObjectId, validateSubscriptionUpdate, async (req, res) => {
    try {
        const subscription = await subscriptionService.update(
            req.params.id,
            req.user._id,
            req.validatedBody
        );

        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('subscription_updated', subscription);

        res.json({
            success: true,
            message: 'Subscription updated successfully',
            data: subscription
        });
    } catch (error) {
        console.error('[Subscriptions] Update error:', error);
        if (error.message === 'Subscription not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/subscriptions/:id/cancel
 * @desc    Cancel a subscription
 * @access  Private
 */
router.post('/:id/cancel', auth, validateObjectId, async (req, res) => {
    try {
        const subscription = await subscriptionService.cancel(req.params.id, req.user._id);

        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('subscription_updated', subscription);

        res.json({
            success: true,
            message: 'Subscription cancelled',
            data: subscription
        });
    } catch (error) {
        console.error('[Subscriptions] Cancel error:', error);
        if (error.message === 'Subscription not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/subscriptions/:id/pause
 * @desc    Pause a subscription
 * @access  Private
 */
router.post('/:id/pause', auth, validateObjectId, async (req, res) => {
    try {
        const subscription = await subscriptionService.pause(req.params.id, req.user._id);

        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('subscription_updated', subscription);

        res.json({
            success: true,
            message: 'Subscription paused',
            data: subscription
        });
    } catch (error) {
        console.error('[Subscriptions] Pause error:', error);
        if (error.message === 'Subscription not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/subscriptions/:id/resume
 * @desc    Resume a paused subscription
 * @access  Private
 */
router.post('/:id/resume', auth, validateObjectId, async (req, res) => {
    try {
        const subscription = await subscriptionService.resume(req.params.id, req.user._id);

        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('subscription_updated', subscription);

        res.json({
            success: true,
            message: 'Subscription resumed',
            data: subscription
        });
    } catch (error) {
        console.error('[Subscriptions] Resume error:', error);
        if (error.message === 'Subscription not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/subscriptions/:id/payment
 * @desc    Record a payment for a subscription
 * @access  Private
 */
router.post('/:id/payment', auth, validateObjectId, async (req, res) => {
    try {
        const subscription = await subscriptionService.recordPayment(req.params.id, req.user._id);

        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('subscription_updated', subscription);

        res.json({
            success: true,
            message: 'Payment recorded',
            data: subscription
        });
    } catch (error) {
        console.error('[Subscriptions] Record payment error:', error);
        if (error.message === 'Subscription not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/subscriptions/:id/used
 * @desc    Mark subscription as used
 * @access  Private
 */
router.post('/:id/used', auth, validateObjectId, async (req, res) => {
    try {
        const subscription = await subscriptionService.markAsUsed(req.params.id, req.user._id);

        res.json({
            success: true,
            message: 'Subscription marked as used',
            data: subscription
        });
    } catch (error) {
        console.error('[Subscriptions] Mark used error:', error);
        if (error.message === 'Subscription not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   DELETE /api/subscriptions/:id
 * @desc    Delete a subscription permanently
 * @access  Private
 */
router.delete('/:id', auth, validateObjectId, async (req, res) => {
    try {
        await subscriptionService.delete(req.params.id, req.user._id);

        const io = req.app.get('io');
        io.to(`user_${req.user._id}`).emit('subscription_deleted', { id: req.params.id });

        res.json({
            success: true,
            message: 'Subscription deleted permanently'
        });
    } catch (error) {
        console.error('[Subscriptions] Delete error:', error);
        if (error.message === 'Subscription not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
