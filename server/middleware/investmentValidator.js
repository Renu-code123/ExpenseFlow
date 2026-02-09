const Joi = require('joi');

// Common validation patterns
const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);
const currencyCode = Joi.string().length(3).uppercase();
const positiveNumber = Joi.number().positive();

// Asset types
const assetTypes = ['stock', 'crypto', 'bond', 'mutual_fund', 'etf', 'real_estate', 'commodity', 'cash', 'other'];
const transactionTypes = ['buy', 'sell', 'dividend', 'split', 'transfer_in', 'transfer_out', 'fee', 'interest'];
const costBasisMethods = ['fifo', 'lifo', 'average'];

// ============ PORTFOLIO VALIDATION ============

const createPortfolioSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).allow(''),
  baseCurrency: currencyCode.default('USD'),
  costBasisMethod: Joi.string().valid(...costBasisMethods).default('fifo'),
  isDefault: Joi.boolean().default(false),
  targetAllocations: Joi.array().items(
    Joi.object({
      assetType: Joi.string().valid(...assetTypes).required(),
      targetPercent: Joi.number().min(0).max(100).required()
    })
  ).custom((value) => {
    if (value && value.length > 0) {
      const total = value.reduce((sum, a) => sum + a.targetPercent, 0);
      if (Math.abs(total - 100) > 0.01) {
        throw new Error('Target allocations must sum to 100%');
      }
    }
    return value;
  })
});

const updatePortfolioSchema = Joi.object({
  name: Joi.string().min(1).max(100),
  description: Joi.string().max(500).allow(''),
  baseCurrency: currencyCode,
  costBasisMethod: Joi.string().valid(...costBasisMethods),
  isDefault: Joi.boolean(),
  targetAllocations: Joi.array().items(
    Joi.object({
      assetType: Joi.string().valid(...assetTypes).required(),
      targetPercent: Joi.number().min(0).max(100).required()
    })
  )
}).min(1);

// ============ TRANSACTION VALIDATION ============

const buyTransactionSchema = Joi.object({
  portfolioId: objectId.required(),
  symbol: Joi.string().uppercase().min(1).max(20).required(),
  assetType: Joi.string().valid(...assetTypes).default('stock'),
  name: Joi.string().max(200),
  quantity: positiveNumber.required(),
  price: positiveNumber,
  currency: currencyCode.default('USD'),
  date: Joi.date().max('now').default(Date.now),
  fees: Joi.object({
    commission: Joi.number().min(0).default(0),
    exchange: Joi.number().min(0).default(0),
    other: Joi.number().min(0).default(0)
  }),
  notes: Joi.string().max(1000).allow('')
});

const sellTransactionSchema = Joi.object({
  portfolioId: objectId.required(),
  symbol: Joi.string().uppercase().min(1).max(20).required(),
  quantity: positiveNumber.required(),
  price: positiveNumber,
  currency: currencyCode.default('USD'),
  costBasisMethod: Joi.string().valid(...costBasisMethods),
  date: Joi.date().max('now').default(Date.now),
  fees: Joi.object({
    commission: Joi.number().min(0).default(0),
    exchange: Joi.number().min(0).default(0),
    other: Joi.number().min(0).default(0)
  }),
  notes: Joi.string().max(1000).allow('')
});

const dividendSchema = Joi.object({
  portfolioId: objectId.required(),
  symbol: Joi.string().uppercase().min(1).max(20).required(),
  dividendPerShare: positiveNumber,
  totalAmount: positiveNumber,
  currency: currencyCode.default('USD'),
  dividendType: Joi.string().valid('cash', 'stock', 'special', 'return_of_capital').default('cash'),
  reinvested: Joi.boolean().default(false),
  reinvestedShares: Joi.number().min(0).when('reinvested', {
    is: true,
    then: Joi.required()
  }),
  reinvestPrice: positiveNumber.when('reinvested', {
    is: true,
    then: Joi.required()
  }),
  date: Joi.date().max('now').default(Date.now),
  notes: Joi.string().max(1000).allow('')
}).or('dividendPerShare', 'totalAmount');

const transferSchema = Joi.object({
  fromPortfolioId: objectId,
  toPortfolioId: objectId,
  symbol: Joi.string().uppercase().min(1).max(20).required(),
  quantity: positiveNumber.required(),
  costBasis: positiveNumber.required(),
  purchaseDate: Joi.date().required(),
  date: Joi.date().max('now').default(Date.now),
  notes: Joi.string().max(1000).allow('')
}).or('fromPortfolioId', 'toPortfolioId');

// ============ ASSET VALIDATION ============

const createAssetSchema = Joi.object({
  symbol: Joi.string().uppercase().min(1).max(20).required(),
  name: Joi.string().min(1).max(200).required(),
  type: Joi.string().valid(...assetTypes).required(),
  currency: currencyCode.default('USD'),
  exchange: Joi.string().max(50),
  sector: Joi.string().max(100),
  industry: Joi.string().max(100),
  description: Joi.string().max(2000),
  logo: Joi.string().uri(),
  website: Joi.string().uri(),
  dataSource: Joi.object({
    provider: Joi.string().valid('alpha_vantage', 'coingecko', 'yahoo', 'manual', 'other'),
    externalId: Joi.string().max(100),
    lastSync: Joi.date()
  })
});

const updateAssetSchema = Joi.object({
  name: Joi.string().min(1).max(200),
  description: Joi.string().max(2000),
  logo: Joi.string().uri(),
  website: Joi.string().uri(),
  sector: Joi.string().max(100),
  industry: Joi.string().max(100),
  isActive: Joi.boolean()
}).min(1);

const manualPriceUpdateSchema = Joi.object({
  assetId: objectId.required(),
  price: positiveNumber.required(),
  date: Joi.date().max('now').default(Date.now),
  source: Joi.string().valid('manual', 'other').default('manual')
});

// ============ WATCHLIST VALIDATION ============

const addToWatchlistSchema = Joi.object({
  symbol: Joi.string().min(1).max(50).required(),
  type: Joi.string().valid('stock', 'crypto', 'etf').default('stock')
});

const removeFromWatchlistSchema = Joi.object({
  assetId: objectId.required()
});

// ============ SEARCH/QUERY VALIDATION ============

const searchAssetsSchema = Joi.object({
  query: Joi.string().min(1).max(100).required(),
  type: Joi.string().valid(...assetTypes),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

const portfolioHistorySchema = Joi.object({
  portfolioId: objectId.required(),
  days: Joi.number().integer().min(1).max(3650).default(365),
  interval: Joi.string().valid('daily', 'weekly', 'monthly').default('daily')
});

const transactionHistorySchema = Joi.object({
  portfolioId: objectId,
  assetId: objectId,
  type: Joi.string().valid(...transactionTypes),
  startDate: Joi.date(),
  endDate: Joi.date().when('startDate', {
    is: Joi.exist(),
    then: Joi.date().min(Joi.ref('startDate'))
  }),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50)
});

const priceHistorySchema = Joi.object({
  assetId: objectId.required(),
  interval: Joi.string().valid('1min', '5min', '15min', '30min', '1hour', '4hour', 'daily', 'weekly', 'monthly').default('daily'),
  days: Joi.number().integer().min(1).max(3650).default(365),
  startDate: Joi.date(),
  endDate: Joi.date()
});

// ============ VALIDATION MIDDLEWARE ============

const validate = (schema) => {
  return (req, res, next) => {
    const dataToValidate = { ...req.body, ...req.params, ...req.query };
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
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }
    
    req.validated = value;
    next();
  };
};

// Middleware exports
module.exports = {
  // Schemas
  createPortfolioSchema,
  updatePortfolioSchema,
  buyTransactionSchema,
  sellTransactionSchema,
  dividendSchema,
  transferSchema,
  createAssetSchema,
  updateAssetSchema,
  manualPriceUpdateSchema,
  addToWatchlistSchema,
  removeFromWatchlistSchema,
  searchAssetsSchema,
  portfolioHistorySchema,
  transactionHistorySchema,
  priceHistorySchema,
  
  // Validation middleware
  validate,
  
  // Pre-built middlewares
  validateCreatePortfolio: validate(createPortfolioSchema),
  validateUpdatePortfolio: validate(updatePortfolioSchema),
  validateBuyTransaction: validate(buyTransactionSchema),
  validateSellTransaction: validate(sellTransactionSchema),
  validateDividend: validate(dividendSchema),
  validateTransfer: validate(transferSchema),
  validateCreateAsset: validate(createAssetSchema),
  validateUpdateAsset: validate(updateAssetSchema),
  validateManualPriceUpdate: validate(manualPriceUpdateSchema),
  validateAddToWatchlist: validate(addToWatchlistSchema),
  validateRemoveFromWatchlist: validate(removeFromWatchlistSchema),
  validateSearchAssets: validate(searchAssetsSchema),
  validatePortfolioHistory: validate(portfolioHistorySchema),
  validateTransactionHistory: validate(transactionHistorySchema),
  validatePriceHistory: validate(priceHistorySchema)
};
