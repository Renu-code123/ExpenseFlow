const express = require('express');
const Joi = require('joi');
const Expense = require('../models/Expense');
const budgetService = require('../services/budgetService');
const categorizationService = require('../services/categorizationService');
const exportService = require('../services/exportService');
const currencyService = require('../services/currencyService');
const aiService = require('../services/aiService');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

const expenseSchema = Joi.object({
  description: Joi.string().trim().max(100).required(),
  amount: Joi.number().min(0.01).required(),
  currency: Joi.string().uppercase().optional(),
  category: Joi.string().valid('food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other').required(),
  type: Joi.string().valid('income', 'expense').required(),
  merchant: Joi.string().trim().max(50).optional(),
  date: Joi.date().optional(),
  workspaceId: Joi.string().hex().length(24).optional()
});

// GET all expenses for authenticated user with pagination support
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user._id);

    // Workspace filtering
    const workspaceId = req.query.workspaceId;
    const query = workspaceId
      ? { workspace: workspaceId }
      : { user: req.user._id, workspace: null };

    // Get total count for pagination info
    const total = await Expense.countDocuments(query);

    const expenses = await Expense.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    // Convert expenses to user's preferred currency if needed
    const convertedExpenses = await Promise.all(expenses.map(async (expense) => {
      const expenseObj = expense.toObject();

      // If expense currency differs from user preference, show converted amount
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
          // If conversion fails, use original amount
          expenseObj.displayAmount = expenseObj.amount;
          expenseObj.displayCurrency = expenseObj.originalCurrency;
        }
      } else {
        expenseObj.displayAmount = expenseObj.amount;
        expenseObj.displayCurrency = expenseObj.originalCurrency;
      }

      return expenseObj;
    }));

    res.json({
      success: true,
      data: convertedExpenses,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});





// DELETE expense for authenticated user
router.delete('/:id', auth, async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    // Update budget calculations
    await budgetService.checkBudgetAlerts(req.user._id);

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`user_${req.user._id}`).emit('expense_deleted', { id: req.params.id });

    res.json({ message: 'Expense deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET export expenses to CSV
router.get('/export', auth, async (req, res) => {
  try {
    const { format, startDate, endDate, category } = req.query;

    // Validate format
    if (format && format !== 'csv') {
      return res.status(400).json({ error: 'Only CSV format is supported' });
    }

    // Get expenses using export service
    const expenses = await exportService.getExpensesForExport(req.user._id, {
      startDate,
      endDate,
      category,
      type: 'all' // Include both income and expenses
    });

    if (expenses.length === 0) {
      return res.status(404).json({ error: 'No expenses found for the selected filters' });
    }

    // Generate CSV using ExportService
    const csv = exportService.generateCSV(expenses);

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');

    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export expenses' });
  }
});

module.exports = router;