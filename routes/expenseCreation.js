const express = require('express');
const Expense = require('../models/Expense');
const User = require('../models/User');
const expenseValidator = require('../middleware/expenseValidator');
const auth = require('../middleware/auth');
const expenseService = require('../services/expenseService');
const { convertExpenseAmount } = require('../utils/currencyUtils');

const router = express.Router();

// POST new expense for authenticated user
router.post('/', auth, expenseValidator, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const { validatedExpense: value, expenseCurrency } = req;

    // Handle auto-categorization
    const { finalCategory, autoCategorized } = await expenseService.handleAutoCategorization(value, req.user._id);

    // Store original amount and currency
    const expenseData = {
      ...value,
      category: finalCategory,
      user: value.workspaceId ? req.user._id : req.user._id,
      addedBy: req.user._id,
      workspace: value.workspaceId || null,
      originalAmount: value.amount,
      originalCurrency: expenseCurrency,
      amount: value.amount,
      autoCategorized
    };

    // Handle currency conversion if needed
    const conversionData = await expenseService.handleCurrencyConversion(value.amount, expenseCurrency, user.preferredCurrency);
    Object.assign(expenseData, conversionData);

    const expense = new Expense(expenseData);
    await expense.save();

    // Handle approval submission
    const { requiresApproval, workflow } = await expenseService.handleApprovalSubmission(expense, req.user._id);

    // Handle budget update
    const amountForBudget = expenseData.convertedAmount || value.amount;
    await expenseService.handleBudgetUpdate(req.user._id, value.type, amountForBudget, value.category);

    // Emit real-time update
    const io = req.app.get('io');
    const expenseForSocket = expenseService.prepareExpenseResponse(expense, user.preferredCurrency);
    expenseService.emitRealTimeUpdate(io, req.user._id, 'expense_created', expenseForSocket);

    const response = {
      ...expenseService.prepareExpenseResponse(expense, user.preferredCurrency),
      requiresApproval,
      workflow: workflow ? { _id: workflow._id, status: workflow.status } : null
    };

    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
