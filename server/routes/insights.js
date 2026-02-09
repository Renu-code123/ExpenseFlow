const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const insightService = require('../services/insightService');
const subscriptionDetector = require('../services/subscriptionDetector');
const FinancialInsight = require('../models/FinancialInsight');
const SpendingPattern = require('../models/SpendingPattern');
const Subscription = require('../models/Subscription');
const {
    validateInsightFilters,
    validateMarkAsRead,
    validateMarkAsActioned,
    validateCreateSubscription,
    validateUpdateSubscription,
    validateSubscriptionId
} = require('../middleware/insightValidator');

/**
 * @route   GET /api/insights
 * @desc    Get all insights for user with filters
 * @access  Private
 */
router.get('/', auth, validateInsightFilters, async (req, res) => {
    try {
        const { type, severity, category, isRead, limit, page } = req.query;
        
        const query = { user: req.user._id };
        
        if (type) query.type = type;
        if (severity) query.severity = severity;
        if (category) query.category = category;
        if (isRead !== undefined) query.isRead = isRead === 'true';
        
        const skip = (page - 1) * limit;
        
        const [insights, total] = await Promise.all([
            FinancialInsight.find(query)
                .sort({ severity: -1, createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            FinancialInsight.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            data: insights,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get insights error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching insights',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/insights/generate
 * @desc    Generate fresh insights for user
 * @access  Private
 */
router.get('/generate', auth, async (req, res) => {
    try {
        const insights = await insightService.generateInsights(req.user._id);
        
        res.json({
            success: true,
            message: `Generated ${insights.length} insights`,
            data: insights
        });
    } catch (error) {
        console.error('Generate insights error:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating insights',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/insights/dashboard
 * @desc    Get dashboard summary of insights
 * @access  Private
 */
router.get('/dashboard', auth, async (req, res) => {
    try {
        const [
            unreadCount,
            criticalInsights,
            healthScore,
            recentAnomalies,
            patterns
        ] = await Promise.all([
            FinancialInsight.getUnreadCount(req.user._id),
            FinancialInsight.getCriticalInsights(req.user._id),
            FinancialInsight.findOne({ user: req.user._id, type: 'health_score' })
                .sort({ createdAt: -1 }),
            FinancialInsight.getByType(req.user._id, 'anomaly', 5),
            SpendingPattern.getActivePatterns(req.user._id)
        ]);
        
        res.json({
            success: true,
            data: {
                unread_count: unreadCount,
                critical_insights: criticalInsights,
                health_score: healthScore,
                recent_anomalies: recentAnomalies,
                patterns: patterns.slice(0, 5)
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard',
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/insights/:id/read
 * @desc    Mark insight as read
 * @access  Private
 */
router.put('/:id/read', auth, validateMarkAsRead, async (req, res) => {
    try {
        const insight = await FinancialInsight.findOne({
            _id: req.params.id,
            user: req.user._id
        });
        
        if (!insight) {
            return res.status(404).json({
                success: false,
                message: 'Insight not found'
            });
        }
        
        await insight.markAsRead();
        
        res.json({
            success: true,
            message: 'Insight marked as read',
            data: insight
        });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking insight as read',
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/insights/:id/action
 * @desc    Mark insight as actioned
 * @access  Private
 */
router.put('/:id/action', auth, validateMarkAsActioned, async (req, res) => {
    try {
        const insight = await FinancialInsight.findOne({
            _id: req.params.id,
            user: req.user._id
        });
        
        if (!insight) {
            return res.status(404).json({
                success: false,
                message: 'Insight not found'
            });
        }
        
        await insight.markAsActioned(req.body.action);
        
        res.json({
            success: true,
            message: 'Insight marked as actioned',
            data: insight
        });
    } catch (error) {
        console.error('Mark as actioned error:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking insight as actioned',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/insights/subscriptions
 * @desc    Get all subscriptions for user
 * @access  Private
 */
router.get('/subscriptions', auth, async (req, res) => {
    try {
        const { status } = req.query;
        
        const query = { user: req.user._id };
        if (status) query.status = status;
        
        const subscriptions = await Subscription.find(query)
            .sort({ next_billing_date: 1 });
        
        const totalMonthlyCost = await Subscription.getTotalMonthlyCost(req.user._id);
        
        res.json({
            success: true,
            data: {
                subscriptions,
                total_monthly_cost: totalMonthlyCost,
                count: subscriptions.length
            }
        });
    } catch (error) {
        console.error('Get subscriptions error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching subscriptions',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/insights/subscriptions/detect
 * @desc    Detect subscriptions from transaction history
 * @access  Private
 */
router.get('/subscriptions/detect', auth, async (req, res) => {
    try {
        const detected = await subscriptionDetector.detectSubscriptions(req.user._id);
        
        res.json({
            success: true,
            message: `Detected ${detected.length} subscriptions`,
            data: detected
        });
    } catch (error) {
        console.error('Detect subscriptions error:', error);
        res.status(500).json({
            success: false,
            message: 'Error detecting subscriptions',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/insights/subscriptions
 * @desc    Create a manual subscription
 * @access  Private
 */
router.post('/subscriptions', auth, validateCreateSubscription, async (req, res) => {
    try {
        const subscription = new Subscription({
            ...req.body,
            user: req.user._id,
            detection_method: 'manual'
        });
        
        await subscription.save();
        
        res.status(201).json({
            success: true,
            message: 'Subscription created successfully',
            data: subscription
        });
    } catch (error) {
        console.error('Create subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating subscription',
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/insights/subscriptions/:id
 * @desc    Update a subscription
 * @access  Private
 */
router.put('/subscriptions/:id', auth, validateSubscriptionId, validateUpdateSubscription, async (req, res) => {
    try {
        const subscription = await Subscription.findOne({
            _id: req.params.id,
            user: req.user._id
        });
        
        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'Subscription not found'
            });
        }
        
        Object.assign(subscription, req.body);
        await subscription.save();
        
        res.json({
            success: true,
            message: 'Subscription updated successfully',
            data: subscription
        });
    } catch (error) {
        console.error('Update subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating subscription',
            error: error.message
        });
    }
});

/**
 * @route   DELETE /api/insights/subscriptions/:id
 * @desc    Cancel a subscription
 * @access  Private
 */
router.delete('/subscriptions/:id', auth, validateSubscriptionId, async (req, res) => {
    try {
        const subscription = await Subscription.findOne({
            _id: req.params.id,
            user: req.user._id
        });
        
        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'Subscription not found'
            });
        }
        
        await subscription.cancel(req.body.reason);
        
        res.json({
            success: true,
            message: 'Subscription cancelled successfully',
            data: subscription
        });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error cancelling subscription',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/insights/patterns
 * @desc    Get spending patterns for user
 * @access  Private
 */
router.get('/patterns', auth, async (req, res) => {
    try {
        const { category } = req.query;
        
        const patterns = category
            ? await SpendingPattern.getByCategory(req.user._id, category)
            : await SpendingPattern.getActivePatterns(req.user._id);
        
        res.json({
            success: true,
            data: patterns
        });
    } catch (error) {
        console.error('Get patterns error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching patterns',
            error: error.message
        });
    }
});

module.exports = router;
