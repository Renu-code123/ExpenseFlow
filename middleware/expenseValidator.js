const Joi = require('joi');
const currencyService = require('../services/currencyService');

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

const expenseValidator = async (req, res, next) => {
  const { error, value } = expenseSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const user = req.user; // Assuming auth middleware sets req.user
  const expenseCurrency = value.currency || user.preferredCurrency;

  if (!currencyService.isValidCurrency(expenseCurrency)) {
    return res.status(400).json({ error: 'Invalid currency code' });
  }

  req.validatedExpense = value;
  req.expenseCurrency = expenseCurrency;
  next();
};

module.exports = expenseValidator;
