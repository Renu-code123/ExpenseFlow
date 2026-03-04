const Joi = require('joi');
const logger = require('../utils/logger');

// Validation schemas
const envelopeSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  category: Joi.string().valid(
    'food', 'transport', 'entertainment', 'utilities', 
    'healthcare', 'shopping', 'education', 'travel', 'other', 'general'
  ).required(),
  allocatedAmount: Joi.number().min(0).required(),
  period: Joi.string().valid('monthly', 'weekly', 'yearly').default('monthly'),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  color: Joi.string().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).default('#64ffda'),
  icon: Joi.string().default('💰'),
  alertThreshold: Joi.number().min(0).max(100).default(80),
  notes: Joi.string().trim().max(500).allow('', null)
});

const allocateSchema = Joi.object({
  amount: Joi.number().min(0.01).required()
});

const spendSchema = Joi.object({
  amount: Joi.number().min(0.01).required(),
  expenseId: Joi.string().allow(null, '')
});

const transferSchema = Joi.object({
  fromEnvelopeId: Joi.string().required(),
  toEnvelopeId: Joi.string().required(),
  amount: Joi.number().min(0.01).required()
});

const updateEnvelopeSchema = Joi.object({
  name: Joi.string().trim().max(100),
  category: Joi.string().valid(
    'food', 'transport', 'entertainment', 'utilities', 
    'healthcare', 'shopping', 'education', 'travel', 'other', 'general'
  ),
  allocatedAmount: Joi.number().min(0),
  period: Joi.string().valid('monthly', 'weekly', 'yearly'),
  startDate: Joi.date(),
  endDate: Joi.date(),
  color: Joi.string().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  icon: Joi.string(),
  alertThreshold: Joi.number().min(0).max(100),
  notes: Joi.string().trim().max(500).allow('', null),
  isActive: Joi.boolean()
});

/**
 * Validate envelope creation data
 */
const validateEnvelope = (req, res, next) => {
  try {
    const { error, value } = envelopeSchema.validate(req.body);
    
    if (error) {
      logger.warn(`Envelope validation error: ${error.details[0].message}`);
      return res.status(400).json({ 
        error: error.details[0].message 
      });
    }

    // Additional validation: endDate must be after startDate
    if (new Date(value.endDate) <= new Date(value.startDate)) {
      return res.status(400).json({ 
        error: 'End date must be after start date' 
      });
    }

    req.validatedBody = value;
    next();
  } catch (error) {
    logger.error('Envelope validation error:', error);
    res.status(500).json({ error: 'Validation error' });
  }
};

/**
 * Validate envelope update data
 */
const validateEnvelopeUpdate = (req, res, next) => {
  try {
    const { error, value } = updateEnvelopeSchema.validate(req.body);
    
    if (error) {
      logger.warn(`Envelope update validation error: ${error.details[0].message}`);
      return res.status(400).json({ 
        error: error.details[0].message 
      });
    }

    // Additional validation: endDate must be after startDate if both provided
    if (value.startDate && value.endDate && new Date(value.endDate) <= new Date(value.startDate)) {
      return res.status(400).json({ 
        error: 'End date must be after start date' 
      });
    }

    req.validatedBody = value;
    next();
  } catch (error) {
    logger.error('Envelope update validation error:', error);
    res.status(500).json({ error: 'Validation error' });
  }
};

/**
 * Validate allocation data
 */
const validateAllocation = (req, res, next) => {
  try {
    const { error, value } = allocateSchema.validate(req.body);
    
    if (error) {
      logger.warn(`Allocation validation error: ${error.details[0].message}`);
      return res.status(400).json({ 
        error: error.details[0].message 
      });
    }

    req.validatedBody = value;
    next();
  } catch (error) {
    logger.error('Allocation validation error:', error);
    res.status(500).json({ error: 'Validation error' });
  }
};

/**
 * Validate spend data
 */
const validateSpend = (req, res, next) => {
  try {
    const { error, value } = spendSchema.validate(req.body);
    
    if (error) {
      logger.warn(`Spend validation error: ${error.details[0].message}`);
      return res.status(400).json({ 
        error: error.details[0].message 
      });
    }

    req.validatedBody = value;
    next();
  } catch (error) {
    logger.error('Spend validation error:', error);
    res.status(500).json({ error: 'Validation error' });
  }
};

/**
 * Validate transfer data
 */
const validateTransfer = (req, res, next) => {
  try {
    const { error, value } = transferSchema.validate(req.body);
    
    if (error) {
      logger.warn(`Transfer validation error: ${error.details[0].message}`);
      return res.status(400).json({ 
        error: error.details[0].message 
      });
    }

    // Additional validation: cannot transfer to same envelope
    if (value.fromEnvelopeId === value.toEnvelopeId) {
      return res.status(400).json({ 
        error: 'Cannot transfer to the same envelope' 
      });
    }

    req.validatedBody = value;
    next();
  } catch (error) {
    logger.error('Transfer validation error:', error);
    res.status(500).json({ error: 'Validation error' });
  }
};

/**
 * Validate envelope ID parameter
 */
const validateEnvelopeId = (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Envelope ID is required' });
    }

    // Check if ID is a valid MongoDB ObjectId format
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!objectIdRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid envelope ID format' });
    }

    next();
  } catch (error) {
    logger.error('Envelope ID validation error:', error);
    res.status(500).json({ error: 'Validation error' });
  }
};

/**
 * Validate query parameters
 */
const validateQueryParams = (req, res, next) => {
  try {
    const { period, category, isActive } = req.query;

    // Validate period
    if (period && !['monthly', 'weekly', 'yearly'].includes(period)) {
      return res.status(400).json({ error: 'Invalid period value' });
    }

    // Validate isActive
    if (isActive !== undefined && !['true', 'false'].includes(isActive)) {
      return res.status(400).json({ error: 'Invalid isActive value' });
    }

    next();
  } catch (error) {
    logger.error('Query validation error:', error);
    res.status(500).json({ error: 'Validation error' });
  }
};

module.exports = {
  validateEnvelope,
  validateEnvelopeUpdate,
  validateAllocation,
  validateSpend,
  validateTransfer,
  validateEnvelopeId,
  validateQueryParams
};
