const xss = require('xss');
const mongoSanitize = require('express-mongo-sanitize');
const { body, validationResult } = require('express-validator');

// XSS sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    for (let key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = xss(req.body[key]);
      }
    }
  }

  // Sanitize query parameters
  if (req.query) {
    for (let key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = xss(req.query[key]);
      }
    }
  }

  // Sanitize URL parameters
  if (req.params) {
    for (let key in req.params) {
      if (typeof req.params[key] === 'string') {
        req.params[key] = xss(req.params[key]);
      }
    }
  }

  next();
};

// MongoDB injection sanitization
const mongoSanitizeMiddleware = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`Sanitized key: ${key} in request from IP: ${req.ip}`);
  }
});

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Common validation rules
const validateExpense = [
  body('description')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Description must be between 1 and 100 characters')
    .escape(),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number'),
  body('category')
    .isIn(['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other'])
    .withMessage('Invalid category'),
  body('type')
    .isIn(['income', 'expense'])
    .withMessage('Type must be income or expense'),
  handleValidationErrors
];

const validateUser = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .escape(),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  handleValidationErrors
];

const validateBudget = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Budget name must be between 1 and 100 characters')
    .escape(),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Budget amount must be a positive number'),
  body('category')
    .isIn(['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other', 'all'])
    .withMessage('Invalid category'),
  handleValidationErrors
];

const validateGoal = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Goal title must be between 1 and 100 characters')
    .escape(),
  body('targetAmount')
    .isFloat({ min: 0 })
    .withMessage('Target amount must be a positive number'),
  body('goalType')
    .isIn(['savings', 'expense_reduction', 'income_increase', 'debt_payoff'])
    .withMessage('Invalid goal type'),
  handleValidationErrors
];

module.exports = {
  sanitizeInput,
  mongoSanitizeMiddleware,
  handleValidationErrors,
  validateExpense,
  validateUser,
  validateBudget,
  validateGoal
};