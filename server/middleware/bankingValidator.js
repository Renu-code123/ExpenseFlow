const Joi = require('joi');

// Schema definitions
const bankingSchemas = {
  // Create link token
  createLinkToken: Joi.object({
    provider: Joi.string().valid('plaid', 'yodlee', 'truelayer').default('plaid'),
    products: Joi.array().items(Joi.string()).default(['transactions']),
    countries: Joi.array().items(Joi.string().length(2)).default(['US']),
    language: Joi.string().default('en'),
    accountTypes: Joi.array().items(Joi.string())
  }),

  // Exchange public token
  exchangeToken: Joi.object({
    publicToken: Joi.string().required(),
    provider: Joi.string().valid('plaid', 'yodlee', 'truelayer').default('plaid'),
    metadata: Joi.object({
      institution: Joi.object({
        institution_id: Joi.string(),
        name: Joi.string()
      }),
      accounts: Joi.array().items(Joi.object())
    })
  }),

  // Connection ID param
  connectionId: Joi.object({
    connectionId: Joi.string().regex(/^[a-f\d]{24}$/i).required()
  }),

  // Account ID param
  accountId: Joi.object({
    accountId: Joi.string().regex(/^[a-f\d]{24}$/i).required()
  }),

  // Transaction ID param
  transactionId: Joi.object({
    transactionId: Joi.string().regex(/^[a-f\d]{24}$/i).required()
  }),

  // Update sync config
  updateSyncConfig: Joi.object({
    frequency: Joi.string().valid('realtime', 'daily', 'weekly', 'manual'),
    syncEnabled: Joi.boolean(),
    transactionDaysToSync: Joi.number().min(1).max(730)
  }),

  // Update account preferences
  updateAccountPreferences: Joi.object({
    includeInNetWorth: Joi.boolean(),
    includeInBudget: Joi.boolean(),
    autoImportTransactions: Joi.boolean(),
    defaultCategory: Joi.string().regex(/^[a-f\d]{24}$/i),
    nickname: Joi.string().max(100),
    color: Joi.string().regex(/^#[0-9A-Fa-f]{6}$/),
    icon: Joi.string().max(50)
  }),

  // Search institutions
  searchInstitutions: Joi.object({
    query: Joi.string().required().min(2),
    provider: Joi.string().valid('plaid', 'yodlee', 'truelayer').default('plaid'),
    country: Joi.string().length(2).default('US')
  }),

  // Review transactions
  reviewTransactions: Joi.object({
    transactionIds: Joi.array().items(
      Joi.string().regex(/^[a-f\d]{24}$/i)
    ).min(1).required(),
    status: Joi.string().valid('approved', 'rejected').required(),
    notes: Joi.string().max(500)
  }),

  // Match transaction
  matchTransaction: Joi.object({
    expenseId: Joi.string().regex(/^[a-f\d]{24}$/i).required()
  }),

  // Convert transactions to expenses
  convertTransactions: Joi.object({
    transactionIds: Joi.array().items(
      Joi.string().regex(/^[a-f\d]{24}$/i)
    ).min(1).required(),
    defaultCategory: Joi.string().regex(/^[a-f\d]{24}$/i)
  }),

  // Bulk categorize
  bulkCategorize: Joi.object({
    transactionIds: Joi.array().items(
      Joi.string().regex(/^[a-f\d]{24}$/i)
    ).min(1).required(),
    categoryId: Joi.string().regex(/^[a-f\d]{24}$/i).required()
  }),

  // Reconcile account
  reconcileAccount: Joi.object({
    reconciledBalance: Joi.number().required()
  }),

  // Get transactions query
  getTransactions: Joi.object({
    accountId: Joi.string().regex(/^[a-f\d]{24}$/i),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    status: Joi.string().valid('pending', 'posted', 'cancelled'),
    reviewStatus: Joi.string().valid('pending', 'approved', 'rejected', 'auto_approved'),
    matchStatus: Joi.string().valid('unmatched', 'matched', 'duplicate', 'manual_match'),
    category: Joi.string(),
    minAmount: Joi.number(),
    maxAmount: Joi.number(),
    search: Joi.string(),
    page: Joi.number().min(1).default(1),
    limit: Joi.number().min(1).max(100).default(50),
    sortBy: Joi.string().valid('date', 'amount', 'merchant').default('date'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // Webhook payload
  webhook: Joi.object({
    webhook_type: Joi.string().required(),
    webhook_code: Joi.string().required(),
    item_id: Joi.string().required(),
    error: Joi.object(),
    new_transactions: Joi.number(),
    removed_transactions: Joi.array().items(Joi.string())
  }).unknown(true),

  // Reauth
  completeReauth: Joi.object({
    publicToken: Joi.string().required()
  }),

  // Date range for reports
  dateRange: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    days: Joi.number().min(1).max(365)
  })
};

// Validation middleware factory
const validate = (schemaName, source = 'body') => {
  return (req, res, next) => {
    const schema = bankingSchemas[schemaName];
    if (!schema) {
      return res.status(500).json({ error: 'Invalid validation schema' });
    }

    const dataToValidate = source === 'params' ? req.params : 
                          source === 'query' ? req.query : req.body;

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace validated data
    if (source === 'params') {
      req.params = value;
    } else if (source === 'query') {
      req.query = value;
    } else {
      req.body = value;
    }

    next();
  };
};

// Named validators
const validateCreateLinkToken = validate('createLinkToken');
const validateExchangeToken = validate('exchangeToken');
const validateConnectionId = validate('connectionId', 'params');
const validateAccountId = validate('accountId', 'params');
const validateTransactionId = validate('transactionId', 'params');
const validateUpdateSyncConfig = validate('updateSyncConfig');
const validateUpdateAccountPreferences = validate('updateAccountPreferences');
const validateSearchInstitutions = validate('searchInstitutions', 'query');
const validateReviewTransactions = validate('reviewTransactions');
const validateMatchTransaction = validate('matchTransaction');
const validateConvertTransactions = validate('convertTransactions');
const validateBulkCategorize = validate('bulkCategorize');
const validateReconcileAccount = validate('reconcileAccount');
const validateGetTransactions = validate('getTransactions', 'query');
const validateWebhook = validate('webhook');
const validateCompleteReauth = validate('completeReauth');
const validateDateRange = validate('dateRange', 'query');

// Request validator helper
const validateRequest = (schema, source = 'body') => validate(schema, source);

module.exports = {
  bankingSchemas,
  validate,
  validateRequest,
  validateCreateLinkToken,
  validateExchangeToken,
  validateConnectionId,
  validateAccountId,
  validateTransactionId,
  validateUpdateSyncConfig,
  validateUpdateAccountPreferences,
  validateSearchInstitutions,
  validateReviewTransactions,
  validateMatchTransaction,
  validateConvertTransactions,
  validateBulkCategorize,
  validateReconcileAccount,
  validateGetTransactions,
  validateWebhook,
  validateCompleteReauth,
  validateDateRange
};
