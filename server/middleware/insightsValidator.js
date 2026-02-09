const Joi = require('joi');

/**
 * Validation schemas for AI Insights endpoints
 */
const insightsSchemas = {
  // Forecast query parameters
  forecast: Joi.object({
    months: Joi.number().integer().min(1).max(12).default(3),
    useCache: Joi.string().valid('true', 'false').default('true')
  }),

  // Anomaly detection query parameters
  anomalies: Joi.object({
    days: Joi.number().integer().min(7).max(365).default(90),
    sensitivity: Joi.number().min(1).max(4).default(2),
    useCache: Joi.string().valid('true', 'false').default('true')
  }),

  // Budget optimization query parameters
  budgetOptimization: Joi.object({
    targetSavingsRate: Joi.number().integer().min(0).max(80).default(20),
    useCache: Joi.string().valid('true', 'false').default('true')
  }),

  // Stored insights query parameters
  storedInsights: Joi.object({
    type: Joi.string().valid(
      'forecast',
      'anomaly',
      'health_score',
      'recommendation',
      'trend',
      'budget_optimization',
      'seasonal',
      'category_alert'
    ),
    limit: Joi.number().integer().min(1).max(100).default(20),
    page: Joi.number().integer().min(1).default(1),
    includeExpired: Joi.string().valid('true', 'false').default('false')
  })
};

/**
 * Middleware to validate request based on schema and location
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} location - Where to find data: 'body', 'query', 'params'
 */
const validateRequest = (schema, location = 'body') => {
  return (req, res, next) => {
    const dataToValidate = req[location];
    
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, "'")
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Replace with validated and converted values
    req[location] = value;
    next();
  };
};

module.exports = {
  validateRequest,
  insightsSchemas
};
