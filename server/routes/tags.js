const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Tag = require('../models/Tag');
const CategoryRule = require('../models/CategoryRule');
const TagManagementService = require('../services/tagManagementService');
const CategorizationEngine = require('../services/categorizationEngine');
const MerchantLearningService = require('../services/merchantLearningService');

/**
 * @route   GET /api/tags
 * @desc    Get all tags for user
 */
router.get('/', auth, async (req, res) => {
    try {
        const tags = await Tag.find({ user: req.user._id }).sort({ name: 1 });
        res.json({ success: true, data: tags });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   POST /api/tags
 * @desc    Create/Update a tag
 */
router.post('/', auth, async (req, res) => {
    try {
        const tag = await TagManagementService.upsertTag(req.user._id, req.body);
        res.json({ success: true, data: tag });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   DELETE /api/tags/:id
 * @desc    Delete a tag
 */
router.delete('/:id', auth, async (req, res) => {
    try {
        const tag = await TagManagementService.deleteTag(req.user._id, req.params.id);
        res.json({ success: true, message: 'Tag deleted', data: tag });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   POST /api/tags/merge
 * @desc    Merge two tags
 */
router.post('/merge', auth, async (req, res) => {
    try {
        const { sourceId, targetId } = req.body;
        const tag = await TagManagementService.mergeTags(req.user._id, sourceId, targetId);
        res.json({ success: true, data: tag });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/tags/analytics
 * @desc    Get tag usage analytics
 */
router.get('/analytics', auth, async (req, res) => {
    try {
        const analytics = await TagManagementService.getTagAnalytics(req.user._id);
        res.json({ success: true, data: analytics });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Category Rule Routes

/**
 * @route   GET /api/tags/rules
 * @desc    Get all active category rules
 */
router.get('/rules', auth, async (req, res) => {
    try {
        const rules = await CategoryRule.find({ user: req.user._id }).sort({ priority: -1 });
        res.json({ success: true, data: rules });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   POST /api/tags/rules
 * @desc    Create/Update a category rule
 */
router.post('/rules', auth, async (req, res) => {
    try {
        const rule = new CategoryRule({
            ...req.body,
            user: req.user._id
        });
        await rule.save();
        res.json({ success: true, data: rule });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   POST /api/tags/predict
 * @desc    Predict category and tags for input text
 */
router.post('/predict', auth, async (req, res) => {
    try {
        const prediction = await CategorizationEngine.predict(req.user._id, req.body);
        res.json({ success: true, data: prediction });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/tags/suggestions
 * @desc    Get rule suggestions based on history
 */
router.get('/suggestions', auth, async (req, res) => {
    try {
        const suggestions = await MerchantLearningService.identifyPotentialRules(req.user._id);
        res.json({ success: true, data: suggestions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/tags/rules/export
 * @desc    Export category rules as JSON
 */
router.get('/rules/export', auth, async (req, res) => {
    try {
        const rules = await CategoryRule.find({ user: req.user._id });
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=category-rules-${Date.now()}.json`);
        res.send(JSON.stringify(rules, null, 2));
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
