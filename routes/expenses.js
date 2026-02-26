const express = require('express');
const asyncHandler = require('express-async-handler');

const expenseRepository = require('../repositories/expenseRepository');
const userRepository = require('../repositories/userRepository');
const expenseService = require('../services/expenseService');
const budgetService = require('../services/budgetService');
const exportService = require('../services/exportService');
const currencyService = require('../services/currencyService');

const auth = require('../middleware/auth');
const ResponseFactory = require('../utils/ResponseFactory');
const AppError = require('../utils/AppError');
const { ExpenseSchemas, validateRequest, validateQuery } = require('../middleware/inputValidator');
const { expenseLimiter, exportLimiter } = require('../middleware/rateLimiter');
const { requireAuth, getUserId } = require('../middleware/clerkAuth');
const integrityGuard = require('../middleware/integrityGuard');

const router = express.Router();

/**
 * @route   GET /api/expenses
 */
router.get('/', requireAuth, validateQuery(ExpenseSchemas.filter), asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  const user = await userRepository.findById(req.user._id);
  const workspaceId = req.query.workspaceId;

  const query = workspaceId
    ? { workspace: workspaceId }
    : { user: req.user._id, workspace: null };

  const { documents: expenses, pagination } =
    await expenseRepository.findWithPagination(query, {
      page,
      limit,
      sort: { date: -1 }
    });

  const convertedExpenses = await Promise.all(
    expenses.map(async (expense) => {
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
    })
  );

  return ResponseFactory.paginated(
    res,
    convertedExpenses,
    page,
    limit,
    pagination.total
  );
}));

/**
 * @route POST /api/expenses
 */
router.post(
  '/',
  requireAuth,
  expenseLimiter,
  validateRequest(ExpenseSchemas.create),
  asyncHandler(async (req, res) => {
    const io = req.app.get('io');
    const expense = await expenseService.createExpense(
      req.body,
      req.user._id,
      io
    );

    return ResponseFactory.created(
      res,
      expense,
      'Expense created successfully'
    );
  })
);

/**
 * @route GET /api/expenses/:id
 */
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const expense = await expenseRepository.findById(req.params.id);

  if (!expense ||
      (expense.user.toString() !== req.user._id.toString() && !expense.workspace)
  ) {
    throw new AppError('Expense not found', 404);
  }

  return ResponseFactory.success(res, expense);
}));

/**
 * @route PUT /api/expenses/:id
 */
router.put(
  '/:id',
  requireAuth,
  integrityGuard,
  validateRequest(ExpenseSchemas.create),
  asyncHandler(async (req, res) => {
    const expense = await expenseRepository.updateOne(
      { _id: req.params.id, user: req.user._id },
      req.body
    );

    if (!expense) throw new AppError('Expense not found', 404);

    if (req.body.category && expense.merchant) {
      const merchantLearningService = require('../services/merchantLearningService');
      merchantLearningService
        .learnFromCorrection(
          req.user._id,
          expense.merchant,
          req.body.category
        )
        .catch((err) =>
          console.error('[MerchantLearning] Error:', err)
        );
    }

    return ResponseFactory.success(
      res,
      expense,
      'Expense updated successfully'
    );
  })
);

/**
 * @route DELETE /api/expenses/:id
 */
router.delete('/:id', requireAuth, integrityGuard, asyncHandler(async (req, res) => {
  const expense = await expenseRepository.deleteOne({
    _id: req.params.id,
    user: req.user._id
  });

  if (!expense) throw new AppError('Expense not found', 404);

  const io = req.app.get('io');
  if (io) {
    io.to(`user_${req.user._id}`).emit('expense_deleted', {
      id: req.params.id
    });
  }

  return ResponseFactory.success(
    res,
    null,
    'Expense deleted successfully'
  );
}));

module.exports = router;