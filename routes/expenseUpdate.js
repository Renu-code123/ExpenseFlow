const express = require('express');
const Expense = require('../models/Expense');
const User = require('../models/User');
const expenseValidator = require('../middleware/expenseValidator');
const auth = require('../middleware/auth');
const expenseService = require('../services/expenseService');

const router = express.Router();

// PUT update expense for authenticated user
router.put('/:id', auth, expenseValidator, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const { validatedExpense: value, expenseCurrency } = req;

    // Prepare update data
    const updateData = {
      ...value,
      originalAmount: value.amount,
      originalCurrency: expenseCurrency,
      amount: value.amount
    };

    // Handle currency conversion if needed
    const conversionData = await expenseService.handleCurrencyConversion(value.amount, expenseCurrency, user.preferredCurrency);
    Object.assign(updateData, conversionData);

    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updateData,
      { new: true }
    );
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    // Handle budget update
    await expenseService.handleBudgetUpdate(req.user._id, value.type, updateData.convertedAmount || value.amount, value.category);

    // Emit real-time update
    const io = req.app.get('io');
    const expenseForSocket = expenseService.prepareExpenseResponse(expense, user.preferredCurrency);
    expenseService.emitRealTimeUpdate(io, req.user._id, 'expense_updated', expenseForSocket);

    const response = expenseService.prepareExpenseResponse(expense, user.preferredCurrency);

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
