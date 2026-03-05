const express = require('express');
const Joi = require('joi');
const auth = require('../middleware/auth');
const SharedBudget = require('../models/SharedBudget');
const Group = require('../models/Group');

const router = express.Router();

const sharedBudgetSchema = Joi.object({
  group: Joi.string().required(),
  name: Joi.string().trim().max(100).required(),
  totalAmount: Joi.number().min(0).required(),
  categoryAllocations: Joi.array().items(Joi.object({
    category: Joi.string().valid('food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other', 'all').required(),
    amount: Joi.number().min(0).required()
  })).required(),
  memberContributions: Joi.array().items(Joi.object({
    user: Joi.string().required(),
    amount: Joi.number().min(0).required()
  })).required(),
  period: Joi.string().valid('monthly', 'weekly', 'yearly').default('monthly'),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  alertThreshold: Joi.number().min(0).max(100).default(80)
});

// Middleware to check group membership
const checkGroupMembership = async (req, res, next) => {
  try {
    const groupId = req.body.group || req.params.groupId;
    const group = await Group.findById(groupId);
    if (!group || !group.isMember(req.user._id)) {
      return res.status(403).json({ error: 'Access denied. Not a member of this group.' });
    }
    req.group = group;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create shared budget
router.post('/', auth, checkGroupMembership, async (req, res) => {
  try {
    const { error, value } = sharedBudgetSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const sharedBudget = new SharedBudget({ ...value, createdBy: req.user._id });
    await sharedBudget.save();

    res.status(201).json(sharedBudget);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get shared budgets for user's groups
router.get('/', auth, async (req, res) => {
  try {
    const userGroups = await Group.find({ 'members.user': req.user._id, 'members.isActive': true, isActive: true });
    const groupIds = userGroups.map(g => g._id);

    const sharedBudgets = await SharedBudget.find({ group: { $in: groupIds }, isActive: true })
      .populate('group', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    // Calculate spent for each
    for (const budget of sharedBudgets) {
      await budget.calculateSpent();
    }

    res.json(sharedBudgets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific shared budget
router.get('/:id', auth, async (req, res) => {
  try {
    const sharedBudget = await SharedBudget.findById(req.params.id)
      .populate('group', 'name members')
      .populate('createdBy', 'name')
      .populate('memberContributions.user', 'name');

    if (!sharedBudget) return res.status(404).json({ error: 'Shared budget not found' });

    // Check if user is member of the group
    if (!sharedBudget.group.members.some(m => m.user.toString() === req.user._id.toString() && m.isActive)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await sharedBudget.calculateSpent();
    res.json(sharedBudget);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update shared budget
router.put('/:id', auth, async (req, res) => {
  try {
    const sharedBudget = await SharedBudget.findById(req.params.id).populate('group');
    if (!sharedBudget) return res.status(404).json({ error: 'Shared budget not found' });

    // Check membership
    if (!sharedBudget.group.isMember(req.user._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error, value } = sharedBudgetSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    Object.assign(sharedBudget, value);
    await sharedBudget.save();

    res.json(sharedBudget);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete shared budget
router.delete('/:id', auth, async (req, res) => {
  try {
    const sharedBudget = await SharedBudget.findById(req.params.id).populate('group');
    if (!sharedBudget) return res.status(404).json({ error: 'Shared budget not found' });

    // Check membership
    if (!sharedBudget.group.isMember(req.user._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await SharedBudget.findByIdAndDelete(req.params.id);
    res.json({ message: 'Shared budget deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
