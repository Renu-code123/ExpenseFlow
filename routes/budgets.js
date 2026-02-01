const express = require('express');
const auth = require('../middleware/auth');
const Budget = require('../models/Budget');
const budgetService = require('../services/budgetService');
const { BudgetSchemas, validateRequest, validateQuery } = require('../middleware/inputValidator');
const router = express.Router();

// Create budget
router.post('/', auth, validateRequest(BudgetSchemas.create), async (req, res) => {
  try {
    const budget = new Budget({ ...req.body, user: req.user._id });
    await budget.save();

    res.status(201).json(budget);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all budgets
router.get('/', auth, validateQuery(BudgetSchemas.create), async (req, res) => {
  try {
    const { period, active } = req.query;
    const query = { user: req.user._id };
    
    if (period) query.period = period;
    if (active !== undefined) query.isActive = active === 'true';

    const budgets = await Budget.find(query).sort({ createdAt: -1 });
    
    // Calculate spent amounts
    for (const budget of budgets) {
      await budgetService.calculateBudgetSpent(budget);
    }

    res.json(budgets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get budget summary
router.get('/summary', auth, async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const summary = await budgetService.getBudgetSummary(req.user._id, period);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get budget alerts
router.get('/alerts', auth, async (req, res) => {
  try {
    const alerts = await budgetService.checkBudgetAlerts(req.user._id);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update budget
router.put('/:id', auth, validateRequest(BudgetSchemas.create), async (req, res) => {
  try {
    const budget = await Budget.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true }
    );

    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    res.json(budget);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete budget
router.delete('/:id', auth, async (req, res) => {
  try {
    const budget = await Budget.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    res.json({ message: 'Budget deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create monthly budgets
router.post('/monthly', auth, validateRequest(BudgetSchemas.monthly), async (req, res) => {
  try {
    const budgets = await budgetService.createMonthlyBudgets(req.user._id, req.body);
    res.status(201).json(budgets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set monthly budget limit
router.post('/monthly-limit', auth, validateRequest(BudgetSchemas.limit), async (req, res) => {
  try {
    const { limit } = req.body;
    
    const User = require('../models/User');
    await User.findByIdAndUpdate(req.user._id, { monthlyBudgetLimit: limit });

    res.json({ message: 'Monthly budget limit updated successfully', limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get monthly budget limit and status
router.get('/monthly-limit', auth, async (req, res) => {
  try {
    const User = require('../models/User');
    const Expense = require('../models/Expense');

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate current month's expenses
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const monthlyExpenses = await Expense.aggregate([
      {
        $match: {
          user: req.user._id,
          type: 'expense',
          date: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const totalSpent = monthlyExpenses.length > 0 ? monthlyExpenses[0].total : 0;
    const limit = user.monthlyBudgetLimit || 0;
    const remaining = limit - totalSpent;
    const percentage = limit > 0 ? (totalSpent / limit) * 100 : 0;
    const isExceeded = totalSpent > limit && limit > 0;
    const isNearLimit = percentage >= 80 && !isExceeded;

    res.json({
      limit,
      totalSpent,
      remaining: Math.max(0, remaining),
      percentage: Math.min(100, percentage),
      isExceeded,
      isNearLimit,
      daysInMonth: endOfMonth.getDate(),
      currentDay: now.getDate()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;