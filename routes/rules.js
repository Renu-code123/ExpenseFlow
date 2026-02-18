const express = require('express');
const router = express.Router();
const Rule = require('../models/Rule');
const protect = require('../middleware/authMiddleware');

/**
 * @route   GET /api/rules
 * @desc    Get all rules for the user
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
    try {
        const { workspaceId } = req.query;
        const query = { user: req.user.id };

        if (workspaceId) {
            // Fetch global rules AND workspace specific rules
            query.$or = [
                { workspace: workspaceId },
                { workspace: null, isGlobal: true }
            ];
        } else {
            query.workspace = null;
        }

        const rules = await Rule.find(query).sort({ workspace: -1, createdAt: -1 });
        res.json(rules);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/rules/workspace/:workspaceId/override/:globalRuleId
 * @desc    Create a workspace-level override for a global rule
 */
router.post('/workspace/:workspaceId/override/:globalRuleId', protect, async (req, res) => {
    try {
        const globalRule = await Rule.findOne({ _id: req.params.globalRuleId, user: req.user.id, workspace: null });
        if (!globalRule) return res.status(404).json({ error: 'Global rule not found' });

        const overrideRule = new Rule({
            ...req.body,
            user: req.user.id,
            workspace: req.params.workspaceId,
            overridesRule: globalRule._id,
            isGlobal: false
        });

        const savedRule = await overrideRule.save();
        res.status(201).json(savedRule);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * @route   POST /api/rules
 * @desc    Create a new rule
 * @access  Private
 */
router.post('/', protect, async (req, res) => {
    try {
        const newRule = new Rule({
            ...req.body,
            user: req.user.id
        });
        const savedRule = await newRule.save();
        res.status(201).json(savedRule);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * @route   PUT /api/rules/:id
 * @desc    Update a rule
 * @access  Private
 */
router.put('/:id', protect, async (req, res) => {
    try {
        const updatedRule = await Rule.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            req.body,
            { new: true }
        );
        if (!updatedRule) return res.status(404).json({ message: 'Rule not found' });
        res.json(updatedRule);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * @route   DELETE /api/rules/:id
 * @desc    Delete a rule
 * @access  Private
 */
router.delete('/:id', protect, async (req, res) => {
    try {
        const deletedRule = await Rule.findOneAndDelete({ _id: req.params.id, user: req.user.id });
        if (!deletedRule) return res.status(404).json({ message: 'Rule not found' });
        res.json({ message: 'Rule deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/rules/test
 * @desc    Test a rule against a sample transaction
 * @access  Private
 */
router.post('/test', protect, async (req, res) => {
    try {
        const { rule, transaction } = req.body;
        const ruleEngine = require('../services/ruleEngine');

        const isTriggered = ruleEngine.evaluateTrigger(rule.trigger, transaction);
        let result = { ...transaction };

        if (isTriggered) {
            result = ruleEngine.applyActions(rule.actions, result);
        }

        res.json({ isTriggered, result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
