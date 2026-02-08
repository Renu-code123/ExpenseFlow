const express = require('express');
const expenseRepository = require('../repositories/expenseRepository');
const userRepository = require('../repositories/userRepository');
const expenseService = require('../services/expenseService');
const budgetService = require('../services/budgetService');
const exportService = require('../services/exportService');
const currencyService = require('../services/currencyService');
const auth = require('../middleware/auth');
const ResponseFactory = require('../utils/ResponseFactory');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ExpenseSchemas, validateRequest, validateQuery } = require('../middleware/inputValidator');
const { expenseLimiter, exportLimiter } = require('../middleware/rateLimiter');
const { NotFoundError } = require('../utils/AppError');
const {requireAuth,getUserId}=require('../middleware/clerkAuth');


const router = express.Router();

/**
 * @route   GET /api/expenses
 * @desc    Get all expenses with pagination and filtering
 * @access  Private
 */
router.get('/', requireAuth, validateQuery(ExpenseSchemas.filter), asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  const user = await userRepository.findById(req.user._id);
  const workspaceId = req.query.workspaceId;
  const query = workspaceId
    ? { workspace: workspaceId }
    : { user: req.user._id, workspace: null };

  const { documents: expenses, pagination } = await expenseRepository.findWithPagination(query, {
    page,
    limit,
    sort: { date: -1 }
  });

  // Convert expenses to user's preferred currency if needed for display
  const convertedExpenses = await Promise.all(expenses.map(async (expense) => {
    const expenseObj = expense.toObject ? expense.toObject() : expense;

    if (expenseObj.originalCurrency !== user.preferredCurrency) {
      try {
        const conversion = await currencyService.convertCurrency(
          expenseObj.originalAmount,
          expenseObj.originalCurrency,
          user.preferredCurrency
        );
        expenseObj.displayAmount = conversion.convertedAmount;
        expenseObj.displayCurrency = user.preferredCurrency;
      } catch (error) {
        expenseObj.displayAmount = expenseObj.amount;
        expenseObj.displayCurrency = expenseObj.originalCurrency;
      }
    } else {
      expenseObj.displayAmount = expenseObj.amount;
      expenseObj.displayCurrency = expenseObj.originalCurrency;
    }

    return expenseObj;
  }));

  return ResponseFactory.paginated(res, convertedExpenses, page, limit, pagination.total);
}));

/**
 * @route   POST /api/expenses
 * @desc    Create a new expense
 * @access  Private
 */
router.post('/', requireAuth, expenseLimiter, validateRequest(ExpenseSchemas.create), asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const expense = await expenseService.createExpense(req.body, req.user._id, io);

  return ResponseFactory.created(res, expense, 'Expense created successfully');
}));

/**
 * @route   GET /api/expenses/:id
 * @desc    Get specific expense
 * @access  Private
 */
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const expense = await expenseRepository.findById(req.params.id);

  if (!expense || (expense.user.toString() !== req.user._id.toString() && !expense.workspace)) {
    throw new NotFoundError('Expense not found');
  }

  return ResponseFactory.success(res, expense);
}));

/**
 * @route   PUT /api/expenses/:id
 * @desc    Update an expense
 * @access  Private
 */
router.put('/:id', requireAuth, validateRequest(ExpenseSchemas.create), asyncHandler(async (req, res) => {
  const expense = await expenseRepository.updateOne(
    { _id: req.params.id, user: req.user._id },
    req.body
  );

  if (!expense) throw new NotFoundError('Expense not found');

  // Issue #553: Trigger adaptive learning on manual correction
  if (req.body.category && expense.merchant) {
    const merchantLearningService = require('../services/merchantLearningService');
    merchantLearningService.learnFromCorrection(req.user._id, expense.merchant, req.body.category)
      .catch(err => console.error('[MerchantLearning] Error:', err));
  }

  return ResponseFactory.success(res, expense, 'Expense updated successfully');
}));

/**
 * @route   PATCH /api/expenses/bulk-update
 * @desc    Bulk update expenses
 * @access  Private
 */
router.patch('/bulk-update', requireAuth, validateRequest(ExpenseSchemas.bulkUpdate), asyncHandler(async (req, res) => {
  const { ids, updates } = req.body;
  const io = req.app.get('io');

  const result = await expenseRepository.updateMany(
    { _id: { $in: ids }, user: req.user._id },
    { $set: updates }
  );

  if (result.matchedCount === 0) {
    throw new NotFoundError('No expenses found to update');
  }

  // Emit real-time event
  if (io) {
    io.to(`user_${req.user._id}`).emit('bulk_expense_updated', { ids, updates });
  }

  return ResponseFactory.success(res, {
    matched: result.matchedCount,
    modified: result.modifiedCount
  }, `Successfully updated ${result.modifiedCount} expenses`);
}));

/**
 * @route   POST /api/expenses/bulk-delete
 * @desc    Bulk delete expenses
 * @access  Private
 */
router.post('/bulk-delete', requireAuth, validateRequest(ExpenseSchemas.bulkDelete), asyncHandler(async (req, res) => {
  const { ids } = req.body;
  const io = req.app.get('io');

  const result = await expenseRepository.deleteMany({
    _id: { $in: ids },
    user: req.user._id
  });

  if (result.deletedCount === 0) {
    throw new NotFoundError('No expenses found to delete');
  }

  // Emit real-time event
  if (io) {
    io.to(`user_${req.user._id}`).emit('bulk_expense_deleted', { ids });
  }

  return ResponseFactory.success(res, {
    deleted: result.deletedCount
  }, `Successfully deleted ${result.deletedCount} expenses`);
}));

/**
 * @route   DELETE /api/expenses/:id
 * @desc    Delete an expense
 * @access  Private
 */
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const expense = await expenseRepository.deleteOne({ _id: req.params.id, user: req.user._id });

  if (!expense) throw new NotFoundError('Expense not found');

  // Real-time notification for single delete (adding since it might be missing or useful)
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${req.user._id}`).emit('expense_deleted', { id: req.params.id });
  }

  return ResponseFactory.success(res, null, 'Expense deleted successfully');
}));

/**
 * @route   GET /api/expenses/stats/summary
 * @desc    Get expense summary statistics
 * @access  Private
 */
router.get('/stats/summary', requireAuth, asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const start = startDate ? new Date(startDate) : new Date(new Date().setDate(1));
  const end = endDate ? new Date(endDate) : new Date();

  const stats = await expenseRepository.getStatistics(req.user._id, start, end);
  return ResponseFactory.success(res, stats);
}));

/**
 * @route   GET /api/expenses/stats/trends
 * @desc    Get expense trends
 * @access  Private
 */
router.get('/stats/trends', requireAuth, asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const trends = await expenseRepository.getTrends(req.user._id, parseInt(days));
  return ResponseFactory.success(res, trends);
}));

/**
 * @route   POST /api/expenses/export
 * @desc    Export expenses to CSV/PDF
 * @access  Private
 */
router.post('/export', requireAuth, exportLimiter, asyncHandler(async (req, res) => {
  const { format = 'csv', startDate, endDate, workspaceId, category, type, currency, title } = req.body;

  const query = {
    user: req.user._id,
    workspace: workspaceId || null
  };

  if (startDate && endDate) {
    query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  if (category && category !== 'all') {
    query.category = category;
  }

  if (type && type !== 'all') {
    query.type = type;
  }

  const expenses = await expenseRepository.findAll(query, { sort: { date: -1 } });

  // Use user's preferred currency if not specified, or default to INR
  const exportCurrency = currency || req.user.preferredCurrency || 'INR';

  const fileData = await exportService.generateExport(expenses, format, {
    currency: exportCurrency,
    title: title || 'Expense Application Report'
  });

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=expenses-${Date.now()}.csv`);
  } else if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=report-${Date.now()}.pdf`);
  } else if (format === 'excel' || format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=report-${Date.now()}.xlsx`);
  }

  return res.send(fileData);
}));

/**
 * @route   POST /api/expenses/report/preview
 * @desc    Get report preview data
 * @access  Private
 */
router.post('/report/preview', requireAuth, asyncHandler(async (req, res) => {
  const { startDate, endDate, workspaceId, category, type } = req.body;

  const query = {
    user: req.user._id,
    workspace: workspaceId || null
  };

  if (startDate && endDate) {
    query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  if (category && category !== 'all') {
    query.category = category;
  }

  if (type && type !== 'all') {
    query.type = type;
  }

  const expenses = await expenseRepository.findAll(query, { sort: { date: -1 } });

  const previewData = await exportService.generatePreview(expenses);

  return ResponseFactory.success(res, previewData);
}));

module.exports = router;