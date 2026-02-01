const express = require('express');
const auth = require('../middleware/auth');
const Goal = require('../models/Goal');
const goalService = require('../services/goalService');
const { GoalSchemas, validateRequest, validateQuery } = require('../middleware/inputValidator');
const { goalLimiter } = require('../middleware/rateLimiter');
const router = express.Router();

/**
 * @route   GET /api/goals
 * @desc    Get all goals for user
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const goals = await Goal.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: goals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/goals
 * @desc    Create a new goal
 * @access  Private
 */
router.post('/', auth, goalLimiter, validateRequest(GoalSchemas.create), async (req, res) => {
  try {
    const goal = new Goal({ ...req.body, user: req.user._id });

    // Add default milestones if not provided
    if (!goal.milestones || goal.milestones.length === 0) {
      goal.milestones = [
        { percentage: 25 },
        { percentage: 50 },
        { percentage: 75 },
        { percentage: 100 }
      ];
    }

    await goal.save();
    res.status(201).json({ success: true, data: goal });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/goals/analyze/impact
 * @desc    Analyze impact of a potential large expense on all goals
 * @access  Private
 */
router.get('/analyze/impact', auth, async (req, res) => {
  try {
    const { amount } = req.query;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Valid amount is required' });

    const impacts = await goalService.analyzeExpenseImpact(req.user._id, parseFloat(amount));
    res.json({ success: true, data: impacts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/goals/:id
 * @desc    Get specific goal with prediction
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const prediction = await goalService.predictCompletion(goal._id, req.user._id);

    res.json({
      success: true,
      data: {
        ...goal.toJSON(),
        prediction
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   PUT /api/goals/:id
 * @desc    Update a goal
 * @access  Private
 */
router.put('/:id', auth, async (req, res) => {
  try {
    const { error, value } = goalValidationSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const goal = await Goal.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      value,
      { new: true }
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    // Check milestones after update
    await goalService.checkMilestones(goal._id);

    res.json({ success: true, data: goal });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   PATCH /api/goals/:id/contribute
 * @desc    Add funds to a goal
 * @access  Private
 */
router.patch('/:id/contribute', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Valid positive amount is required' });
    }

    const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    goal.currentAmount += amount;

    // Auto-complete if reached target
    if (goal.currentAmount >= goal.targetAmount) {
      goal.status = 'completed';
    }

    // Check milestones
    const alerts = await goalService.checkMilestones(goal._id);

    await goal.save();

    res.json({
      success: true,
      data: goal,
      alerts: alerts || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   DELETE /api/goals/:id
 * @desc    Delete a goal
 * @access  Private
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const goal = await Goal.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json({ success: true, message: 'Goal deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;