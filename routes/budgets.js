const express = require('express');
const auth = require('../middleware/auth');
const budgetRepository = require('../repositories/budgetRepository');
const userRepository = require('../repositories/userRepository');
const expenseRepository = require('../repositories/expenseRepository');
const budgetService = require('../services/budgetService');
const ResponseFactory = require('../utils/ResponseFactory');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { BudgetSchemas, validateRequest, validateQuery } = require('../middleware/inputValidator');
const { budgetLimiter } = require('../middleware/rateLimiter');
const { NotFoundError } = require('../utils/AppError');

const router = express.Router();

/**
 * @route   POST /api/budgets
 * @desc    Create a new budget
 * @access  Private
 */
router.post('/', auth, budgetLimiter, validateRequest(BudgetSchemas.create), asyncHandler(async (req, res) => {
  const budget = await budgetService.createBudget(req.user._id, req.body);
  return ResponseFactory.created(res, budget, 'Budget created successfully');
}));

/**
 * @route   GET /api/budgets
 * @desc    Get all budgets with filtering
 * @access  Private
 */
router.get('/', auth, validateQuery(BudgetSchemas.create), asyncHandler(async (req, res) => {
  const { period, active } = req.query;
  const filters = {};

  if (period) filters.period = period;
  if (active !== undefined) filters.isActive = active === 'true';

  const budgets = await budgetRepository.findByUser(req.user._id, filters, { sort: { createdAt: -1 } });

  return ResponseFactory.success(res, budgets);
}));

/**
 * @route   GET /api/budgets/summary
 * @desc    Get budget summary
 * @access  Private
 */
router.get('/summary', auth, asyncHandler(async (req, res) => {
  const { period } = req.query;
  const summary = await budgetRepository.getSummary(req.user._id, period);
  return ResponseFactory.success(res, summary);
}));

/**
 * @route   GET /api/budgets/alerts
 * @desc    Get budget alerts
 * @access  Private
 */
router.get('/alerts', auth, asyncHandler(async (req, res) => {
  const { alerts } = await budgetService.checkBudgetAlerts(req.user._id);
  return ResponseFactory.success(res, alerts);
}));

/**
 * @route   GET /api/budgets/intelligence
 * @desc    Get budgets with AI intelligence data
 * @access  Private
 */
router.get('/intelligence', auth, asyncHandler(async (req, res) => {
  const budgets = await budgetService.getBudgetsWithIntelligence(req.user._id);
  return ResponseFactory.success(res, budgets);
}));

/**
 * @route   PUT /api/budgets/:id
 * @desc    Update a budget
 * @access  Private
 */
router.put('/:id', auth, validateRequest(BudgetSchemas.create), asyncHandler(async (req, res) => {
  const budget = await budgetRepository.updateOne(
    { _id: req.params.id, user: req.user._id },
    req.body
  );

  if (!budget) throw new NotFoundError('Budget not found');
  return ResponseFactory.success(res, budget, 'Budget updated successfully');
}));

/**
 * @route   DELETE /api/budgets/:id
 * @desc    Delete a budget
 * @access  Private
 */
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  const budget = await budgetRepository.deleteOne({ _id: req.params.id, user: req.user._id });
  if (!budget) throw new NotFoundError('Budget not found');

  return ResponseFactory.success(res, null, 'Budget deleted successfully');
}));

/**
 * @route   GET /api/budgets/monthly-limit
 * @desc    Get monthly budget limit and status
 * @access  Private
 */
router.get('/monthly-limit', auth, asyncHandler(async (req, res) => {
  const user = await userRepository.findById(req.user._id);
  if (!user) throw new NotFoundError('User not found');

  // Calculate current month's expenses
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const totalSpent = await expenseRepository.getTotalByUser(req.user._id, {
    date: { $gte: startOfMonth, $lte: endOfMonth }
  });

  const limit = user.monthlyBudgetLimit || 0;
  const remaining = limit - totalSpent;
  const percentage = limit > 0 ? (totalSpent / limit) * 100 : 0;
  const isExceeded = totalSpent > limit && limit > 0;

  return ResponseFactory.success(res, {
    limit,
    totalSpent,
    remaining: Math.max(0, remaining),
    percentage: Math.min(100, percentage),
    isExceeded,
    daysInMonth: endOfMonth.getDate(),
    currentDay: now.getDate()
  });
}));

/**
 * @route   POST /api/budgets/monthly-limit
 * @desc    Set monthly budget limit
 * @access  Private
 */
router.post('/monthly-limit', auth, validateRequest(BudgetSchemas.limit), asyncHandler(async (req, res) => {
  const { limit } = req.body;
  await userRepository.updateById(req.user._id, { monthlyBudgetLimit: limit });
  return ResponseFactory.success(res, { limit }, 'Monthly budget limit updated successfully');
}));

module.exports = router;