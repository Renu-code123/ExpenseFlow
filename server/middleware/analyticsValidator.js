const Joi = require('joi');

// Spending trends validation schema
const trendsSchema = Joi.object({
    period: Joi.string().valid('daily', 'weekly', 'monthly').default('monthly'),
    months: Joi.number().min(1).max(24).default(6)
});

// Category breakdown validation schema
const categorySchema = Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate')).optional(),
    type: Joi.string().valid('income', 'expense').default('expense')
});

// Comparison validation schema
const comparisonSchema = Joi.object({
    months: Joi.number().min(1).max(12).default(3)
});

// Date range validation schema
const dateRangeSchema = Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
});

/**
 * Validate spending trends request
 */
const validateTrends = (req, res, next) => {
    const { error, value } = trendsSchema.validate(req.query, {
        stripUnknown: true
    });

    if (error) {
        return res.status(400).json({
            error: 'Invalid parameters',
            details: error.details.map(d => d.message)
        });
    }

    req.validatedQuery = value;
    next();
};

/**
 * Validate category breakdown request
 */
const validateCategory = (req, res, next) => {
    const { error, value } = categorySchema.validate(req.query, {
        stripUnknown: true
    });

    if (error) {
        return res.status(400).json({
            error: 'Invalid parameters',
            details: error.details.map(d => d.message)
        });
    }

    req.validatedQuery = value;
    next();
};

/**
 * Validate comparison request
 */
const validateComparison = (req, res, next) => {
    const { error, value } = comparisonSchema.validate(req.query, {
        stripUnknown: true
    });

    if (error) {
        return res.status(400).json({
            error: 'Invalid parameters',
            details: error.details.map(d => d.message)
        });
    }

    req.validatedQuery = value;
    next();
};

/**
 * Validate date range request
 */
const validateDateRange = (req, res, next) => {
    const { error, value } = dateRangeSchema.validate(req.query, {
        stripUnknown: true
    });

    if (error) {
        return res.status(400).json({
            error: 'Invalid parameters',
            details: error.details.map(d => d.message)
        });
    }

    req.validatedQuery = value;
    next();
};

/**
 * Check if analytics are available (has enough data)
 */
const checkAnalyticsAvailable = async (req, res, next) => {
    try {
        const Expense = require('../models/Expense');
        const expenseCount = await Expense.countDocuments({ user: req.user._id });

        if (expenseCount === 0) {
            return res.status(200).json({
                success: true,
                message: 'No expense data available yet',
                data: null,
                hint: 'Start adding expenses to see analytics'
            });
        }

        req.expenseCount = expenseCount;
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    validateTrends,
    validateCategory,
    validateComparison,
    validateDateRange,
    checkAnalyticsAvailable
};
