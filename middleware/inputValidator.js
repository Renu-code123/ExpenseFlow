const Joi = require('joi');
const sanitizeHtml = require('sanitize-html');
const xss = require('xss');

/**
 * Comprehensive Input Validation Middleware
 * Issue #461: Missing Input Validation on User Data
 * 
 * Provides centralized validation schemas and sanitization for all user inputs
 */

// Custom Joi error messages
const joiConfig = {
  abortEarly: false,
  stripUnknown: true,
  messages: {
    'string.empty': 'Field cannot be empty',
    'string.email': 'Must be a valid email address',
    'string.pattern.base': 'Invalid format',
    'number.base': 'Must be a number',
    'number.positive': 'Must be a positive number',
    'date.base': 'Must be a valid date',
    'array.base': 'Must be an array',
    'object.base': 'Must be an object'
  }
};

// Sanitization function for user inputs
const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    // Remove XSS payloads
    let sanitized = xss(input, {
      whiteList: {},
      stripIgnoredTag: true
    });
    // Remove potentially harmful characters
    sanitized = sanitized.trim();
    return sanitized;
  }
  return input;
};

// ================== COMMON VALIDATION SCHEMAS ==================

const CommonSchemas = {
  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
    sort: Joi.string().optional()
  }),

  // MongoDB ObjectId
  mongoId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required().messages({
    'string.pattern.base': 'Invalid ID format'
  }),

  // Email
  email: Joi.string().email().lowercase().required().messages({
    'string.email': 'Must be a valid email address'
  }),

  // Password
  password: Joi.string()
    .min(12)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .required()
    .messages({
      'string.min': 'Password must be at least 12 characters',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character'
    }),

  // Currency
  currency: Joi.string().uppercase().length(3).pattern(/^[A-Z]{3}$/),

  // URL
  url: Joi.string().uri().optional(),

  // Phone number
  phone: Joi.string().pattern(/^(\+\d{1,3})?[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}$/).optional(),

  // Amount (money)
  amount: Joi.number().precision(2).min(0.01).max(999999999.99).required().messages({
    'number.min': 'Amount must be greater than 0',
    'number.max': 'Amount exceeds maximum allowed'
  }),

  // Percentage
  percentage: Joi.number().min(0).max(100).required(),

  // Date
  date: Joi.date().iso().optional(),

  // Description/Notes
  description: Joi.string().trim().max(5000).optional(),

  // Name
  name: Joi.string().trim().min(1).max(100).required().messages({
    'string.empty': 'Name cannot be empty',
    'string.max': 'Name cannot exceed 100 characters'
  })
};

// ================== AUTHENTICATION SCHEMAS ==================

const AuthSchemas = {
  register: Joi.object({
    name: CommonSchemas.name,
    email: CommonSchemas.email,
    password: CommonSchemas.password,
    locale: Joi.string().optional(),
    preferredCurrency: CommonSchemas.currency.optional()
  }).unknown(false),

  login: Joi.object({
    email: CommonSchemas.email,
    password: Joi.string().required(),
    totpToken: Joi.string().length(6).pattern(/^\d+$/).optional(),
    rememberMe: Joi.boolean().default(false)
  }).unknown(false),

  emailVerification: Joi.object({
    email: CommonSchemas.email,
    verificationCode: Joi.string().length(6).pattern(/^\d+$/).required()
  }).unknown(false),

  passwordReset: Joi.object({
    email: CommonSchemas.email,
    newPassword: CommonSchemas.password
  }).unknown(false),

  twoFactorSetup: Joi.object({
    method: Joi.string().valid('totp', 'email', 'sms').required(),
    phone: CommonSchemas.phone
  }).unknown(false)
};

// ================== EXPENSE SCHEMAS ==================

const ExpenseSchemas = {
  create: Joi.object({
    description: Joi.string().trim().max(200).required().messages({
      'string.empty': 'Description is required',
      'string.max': 'Description cannot exceed 200 characters'
    }),
    amount: CommonSchemas.amount,
    currency: CommonSchemas.currency.optional(),
    category: Joi.string()
      .valid('food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other', 'salary', 'investment')
      .required(),
    type: Joi.string().valid('income', 'expense').required(),
    merchant: Joi.string().trim().max(100).optional(),
    date: CommonSchemas.date.required(),
    tags: Joi.array().items(Joi.string().trim().max(30)).max(10).optional(),
    notes: CommonSchemas.description,
    receipt: Joi.string().uri().optional(),
    workspaceId: CommonSchemas.mongoId.optional()
  }).unknown(false),

  update: Joi.object({
    description: Joi.string().trim().max(200).optional(),
    amount: CommonSchemas.amount.optional(),
    currency: CommonSchemas.currency.optional(),
    category: Joi.string()
      .valid('food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other', 'salary', 'investment')
      .optional(),
    type: Joi.string().valid('income', 'expense').optional(),
    merchant: Joi.string().trim().max(100).optional(),
    date: CommonSchemas.date.optional(),
    tags: Joi.array().items(Joi.string().trim().max(30)).max(10).optional(),
    notes: CommonSchemas.description
  }).unknown(false),

  filter: Joi.object({
    ...CommonSchemas.pagination,
    category: Joi.string().optional(),
    type: Joi.string().valid('income', 'expense').optional(),
    startDate: CommonSchemas.date.optional(),
    endDate: CommonSchemas.date.optional(),
    minAmount: Joi.number().min(0).optional(),
    maxAmount: Joi.number().min(0).optional(),
    merchant: Joi.string().trim().optional(),
    tags: Joi.array().items(Joi.string()).optional()
  }).unknown(false)
};

// ================== BUDGET SCHEMAS ==================

const BudgetSchemas = {
  create: Joi.object({
    name: CommonSchemas.name,
    category: Joi.string()
      .valid('food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other', 'all')
      .required(),
    amount: CommonSchemas.amount,
    period: Joi.string().valid('daily', 'weekly', 'monthly', 'yearly').default('monthly'),
    startDate: CommonSchemas.date.required(),
    endDate: CommonSchemas.date.required(),
    alertThreshold: CommonSchemas.percentage.default(80),
    alerts: Joi.object({
      email: Joi.boolean().default(true),
      push: Joi.boolean().default(true),
      sms: Joi.boolean().default(false)
    }).optional()
  }).unknown(false),

  monthly: Joi.object({
    food: CommonSchemas.amount.optional(),
    transport: CommonSchemas.amount.optional(),
    entertainment: CommonSchemas.amount.optional(),
    utilities: CommonSchemas.amount.optional(),
    healthcare: CommonSchemas.amount.optional(),
    shopping: CommonSchemas.amount.optional(),
    other: CommonSchemas.amount.optional()
  }).unknown(false),

  limit: Joi.object({
    limit: CommonSchemas.amount.required()
  }).unknown(false)
};

// ================== GOAL SCHEMAS ==================

const GoalSchemas = {
  create: Joi.object({
    title: Joi.string().trim().max(100).required(),
    description: CommonSchemas.description,
    targetAmount: CommonSchemas.amount,
    currentAmount: Joi.number().min(0).precision(2).default(0),
    goalType: Joi.string()
      .valid('savings', 'expense_reduction', 'income_increase', 'debt_payoff', 'emergency_fund')
      .required(),
    category: Joi.string()
      .valid('food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other', 'general', 'travel', 'car', 'house', 'education')
      .default('general'),
    targetDate: CommonSchemas.date.required(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    reminderFrequency: Joi.string().valid('daily', 'weekly', 'monthly', 'none').default('weekly'),
    autoAllocate: Joi.boolean().default(false),
    milestones: Joi.array().items(
      Joi.object({
        percentage: CommonSchemas.percentage,
        achieved: Joi.boolean().default(false)
      })
    ).optional(),
    color: Joi.string().pattern(/^#[0-9A-F]{6}$/i).optional()
  }).unknown(false)
};

// ================== GROUP SCHEMAS ==================

const GroupSchemas = {
  create: Joi.object({
    name: CommonSchemas.name,
    description: Joi.string().trim().max(500).optional(),
    currency: CommonSchemas.currency.default('USD'),
    settings: Joi.object({
      allowPublicExpenses: Joi.boolean().default(false),
      requireApproval: Joi.boolean().default(false),
      defaultSplitMethod: Joi.string().valid('equal', 'percentage', 'amount').default('equal')
    }).optional()
  }).unknown(false),

  addMember: Joi.object({
    email: CommonSchemas.email,
    role: Joi.string().valid('member', 'admin', 'moderator').default('member')
  }).unknown(false),

  updateSettings: Joi.object({
    allowPublicExpenses: Joi.boolean().optional(),
    requireApproval: Joi.boolean().optional(),
    defaultSplitMethod: Joi.string().valid('equal', 'percentage', 'amount').optional()
  }).unknown(false)
};

// ================== INVOICE SCHEMAS ==================

const InvoiceSchemas = {
  create: Joi.object({
    client: CommonSchemas.mongoId,
    description: CommonSchemas.description.optional(),
    items: Joi.array().items(
      Joi.object({
        description: Joi.string().trim().max(200).required(),
        quantity: Joi.number().positive().precision(2).required(),
        unitPrice: CommonSchemas.amount.required(),
        taxRate: CommonSchemas.percentage.default(0).optional()
      })
    ).min(1).required(),
    dueDate: CommonSchemas.date.required(),
    notes: CommonSchemas.description,
    terms: Joi.string().trim().max(500).optional(),
    taxId: Joi.string().trim().max(50).optional()
  }).unknown(false),

  payment: Joi.object({
    invoice: CommonSchemas.mongoId,
    amount: CommonSchemas.amount,
    paymentMethod: Joi.string()
      .valid('bank_transfer', 'paypal', 'stripe', 'cash', 'check', 'credit_card', 'debit_card', 'other')
      .required(),
    transactionId: Joi.string().trim().max(100).optional(),
    date: CommonSchemas.date.optional(),
    notes: CommonSchemas.description
  }).unknown(false)
};

// ================== PAYMENT SCHEMAS ==================

const PaymentSchemas = {
  create: InvoiceSchemas.payment,
  filter: Joi.object({
    ...CommonSchemas.pagination,
    status: Joi.string().valid('pending', 'completed', 'failed', 'cancelled').optional(),
    paymentMethod: Joi.string().optional(),
    minAmount: Joi.number().min(0).optional(),
    maxAmount: Joi.number().min(0).optional()
  }).unknown(false)
};

// ================== USER PROFILE SCHEMAS ==================

const UserSchemas = {
  update: Joi.object({
    name: CommonSchemas.name.optional(),
    email: CommonSchemas.email.optional(),
    phone: CommonSchemas.phone,
    preferredCurrency: CommonSchemas.currency.optional(),
    locale: Joi.string().pattern(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
    timezone: Joi.string().optional(),
    profilePicture: CommonSchemas.url,
    bio: Joi.string().trim().max(500).optional()
  }).unknown(false),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: CommonSchemas.password
  }).unknown(false)
};

// ================== SHARED SPACE SCHEMAS ==================

const SharedSpaceSchemas = {
  create: Joi.object({
    name: CommonSchemas.name,
    description: CommonSchemas.description,
    currency: CommonSchemas.currency.optional(),
    members: Joi.array().items(
      Joi.object({
        email: CommonSchemas.email,
        role: Joi.string().valid('member', 'admin').default('member')
      })
    ).optional()
  }).unknown(false),

  invite: Joi.object({
    email: CommonSchemas.email,
    role: Joi.string().valid('member', 'admin').default('member')
  }).unknown(false)
};

// ================== REPORT/ANALYTICS SCHEMAS ==================

const ReportSchemas = {
  generate: Joi.object({
    type: Joi.string().valid('monthly', 'quarterly', 'yearly', 'custom').required(),
    startDate: CommonSchemas.date.optional(),
    endDate: CommonSchemas.date.optional(),
    categories: Joi.array().items(Joi.string()).optional(),
    format: Joi.string().valid('pdf', 'csv', 'json').default('pdf')
  }).unknown(false),

  filter: Joi.object({
    ...CommonSchemas.pagination,
    startDate: CommonSchemas.date.optional(),
    endDate: CommonSchemas.date.optional(),
    category: Joi.string().optional()
  }).unknown(false)
};

// ================== VALIDATION MIDDLEWARE ==================

/**
 * Create validation middleware for a given schema
 */
const validateRequest = (schema, source = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], joiConfig);

    if (error) {
      const errors = error.details.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    // Attach sanitized values to request
    req[source] = value;
    next();
  };
};

/**
 * Validate and sanitize query parameters
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    // First convert string numbers to actual numbers for query params
    Object.keys(req.query).forEach(key => {
      if (!isNaN(req.query[key]) && req.query[key] !== '') {
        req.query[key] = Number(req.query[key]);
      }
    });

    const { error, value } = schema.validate(req.query, joiConfig);

    if (error) {
      const errors = error.details.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: errors
      });
    }

    req.query = value;
    next();
  };
};

/**
 * Validate path parameters
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, joiConfig);

    if (error) {
      const errors = error.details.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      return res.status(400).json({
        success: false,
        error: 'Invalid path parameters',
        details: errors
      });
    }

    req.params = value;
    next();
  };
};

// ================== EXPORTS ==================

module.exports = {
  // Sanitization
  sanitizeInput,
  sanitizeHtml,

  // Common
  CommonSchemas,

  // Domain-specific schemas
  AuthSchemas,
  ExpenseSchemas,
  BudgetSchemas,
  GoalSchemas,
  GroupSchemas,
  InvoiceSchemas,
  PaymentSchemas,
  UserSchemas,
  SharedSpaceSchemas,
  ReportSchemas,

  // Middleware factories
  validateRequest,
  validateQuery,
  validateParams,

  // Helpers
  joiConfig
};
