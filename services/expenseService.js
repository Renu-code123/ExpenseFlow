const Expense = require('../models/Expense');
const User = require('../models/User');
const CategoryTraining = require('../models/CategoryTraining');
const categorizationService = require('./categorizationService');
const approvalService = require('./approvalService');
const budgetService = require('./budgetService');
const { convertExpenseAmount, prepareExpenseWithDisplayAmounts } = require('../utils/currencyUtils');

const handleAutoCategorization = async (expenseData, userId) => {
  let finalCategory = expenseData.category;
  let autoCategorized = false;
  let categorySuggestions = [];

  if (!expenseData.category || expenseData.category === 'other') {
    try {
      categorySuggestions = await categorizationService.suggestCategory(
        userId,
        expenseData.description,
        expenseData.amount
      );

      if (categorySuggestions.length > 0) {
        finalCategory = categorySuggestions[0].category;
        autoCategorized = true;

        await CategoryTraining.create({
          user: userId,
          description: expenseData.description,
          amount: expenseData.amount,
          category: finalCategory,
          merchant: expenseData.merchant,
          source: 'auto_categorized'
        });
      }
    } catch (error) {
      console.error('Auto-categorization failed:', error);
    }
  }

  return { finalCategory, autoCategorized, categorySuggestions };
};

const handleCurrencyConversion = async (amount, fromCurrency, toCurrency) => {
  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, convertedCurrency: toCurrency, exchangeRate: 1 };
  }
  const conversion = await convertExpenseAmount(amount, fromCurrency, toCurrency);
  if (conversion) {
    return {
      convertedAmount: conversion.convertedAmount,
      convertedCurrency: toCurrency,
      exchangeRate: conversion.exchangeRate
    };
  }
  return {};
};

const handleApprovalSubmission = async (expense, userId) => {
  let requiresApproval = false;
  let workflow = null;

  if (expense.workspace) {
    requiresApproval = await approvalService.requiresApproval(expense, expense.workspace);
  }

  if (requiresApproval) {
    try {
      workflow = await approvalService.submitForApproval(expense._id, userId);
      expense.status = 'pending_approval';
      expense.approvalWorkflow = workflow._id;
      await expense.save();
    } catch (error) {
      console.error('Failed to submit for approval:', error.message);
    }
  }

  return { requiresApproval, workflow };
};

const handleBudgetUpdate = async (userId, type, amount, category) => {
  if (type === 'expense') {
    await budgetService.checkBudgetAlerts(userId);
  }
  await budgetService.updateGoalProgress(userId, type === 'expense' ? -amount : amount, category);
};

const emitRealTimeUpdate = (io, userId, event, data) => {
  io.to(`user_${userId}`).emit(event, data);
};

const prepareExpenseResponse = (expense, userPreferredCurrency) => {
  const response = prepareExpenseWithDisplayAmounts(expense, userPreferredCurrency);
  return response;
};

module.exports = {
  handleAutoCategorization,
  handleCurrencyConversion,
  handleApprovalSubmission,
  handleBudgetUpdate,
  emitRealTimeUpdate,
  prepareExpenseResponse
};
