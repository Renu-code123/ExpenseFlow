const currencyService = require('../services/currencyService');

const convertExpenseAmount = async (amount, fromCurrency, toCurrency) => {
  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, exchangeRate: 1 };
  }
  try {
    const conversion = await currencyService.convertCurrency(amount, fromCurrency, toCurrency);
    return { convertedAmount: conversion.convertedAmount, exchangeRate: conversion.exchangeRate };
  } catch (error) {
    console.error('Currency conversion failed:', error.message);
    return null; // Or throw error, but for now return null to handle gracefully
  }
};

const prepareExpenseWithDisplayAmounts = (expense, userPreferredCurrency) => {
  const expenseObj = expense.toObject ? expense.toObject() : expense;
  if (expenseObj.originalCurrency !== userPreferredCurrency) {
    // Assuming convertedAmount is already set if conversion happened
    expenseObj.displayAmount = expenseObj.convertedAmount || expenseObj.amount;
    expenseObj.displayCurrency = userPreferredCurrency;
  } else {
    expenseObj.displayAmount = expenseObj.amount;
    expenseObj.displayCurrency = expenseObj.originalCurrency;
  }
  return expenseObj;
};

module.exports = {
  convertExpenseAmount,
  prepareExpenseWithDisplayAmounts
};
