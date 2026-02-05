const Joi = require('joi');

/**
 * Validation middleware for forecasting and anomaly detection endpoints
 */

class ForecastValidator {
    /**
     * Validate forecast generation request
     */
    validateForecastGeneration = (req, res, next) => {
        const schema = Joi.object({
            period_type: Joi.string()
                .valid('weekly', 'monthly', 'quarterly', 'yearly')
                .default('monthly'),
            category: Joi.string()
                .trim()
                .min(1)
                .max(50)
                .optional(),
            algorithm: Joi.string()
                .valid('moving_average', 'linear_regression', 'exponential_smoothing', 'arima', 'prophet')
                .default('moving_average'),
            confidence_level: Joi.number()
                .integer()
                .min(80)
                .max(99)
                .default(95)
        });

        const { error, value } = schema.validate(req.body);

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        req.body = value;
        next();
    };

    /**
     * Validate anomaly detection request
     */
    validateAnomalyDetection = (req, res, next) => {
        const schema = Joi.object({
            lookback_days: Joi.number()
                .integer()
                .min(7)
                .max(365)
                .default(90),
            sensitivity_level: Joi.string()
                .valid('low', 'medium', 'high')
                .default('medium')
        });

        const { error, value } = schema.validate(req.body);

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        req.body = value;
        next();
    };

    /**
     * Validate anomaly review request
     */
    validateAnomalyReview = (req, res, next) => {
        const schema = Joi.object({
            action: Joi.string()
                .valid('mark_normal', 'mark_fraud', 'reviewed')
                .required(),
            notes: Joi.string()
                .trim()
                .max(500)
                .optional()
        });

        const { error, value } = schema.validate(req.body);

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        req.body = value;
        next();
    };

    /**
     * Validate forecast ID parameter
     */
    validateForecastId = (req, res, next) => {
        const schema = Joi.object({
            id: Joi.string()
                .regex(/^[0-9a-fA-F]{24}$/)
                .required()
                .messages({
                    'string.pattern.base': 'Invalid forecast ID format'
                })
        });

        const { error } = schema.validate({ id: req.params.id });

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        next();
    };

    /**
     * Validate expense ID parameter for anomaly analysis
     */
    validateExpenseId = (req, res, next) => {
        const schema = Joi.object({
            expenseId: Joi.string()
                .regex(/^[0-9a-fA-F]{24}$/)
                .required()
                .messages({
                    'string.pattern.base': 'Invalid expense ID format'
                })
        });

        const { error } = schema.validate({ expenseId: req.params.expenseId });

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        next();
    };

    /**
     * Validate anomaly ID parameter
     */
    validateAnomalyId = (req, res, next) => {
        const schema = Joi.object({
            id: Joi.string()
                .regex(/^[0-9a-fA-F]{24}$/)
                .required()
                .messages({
                    'string.pattern.base': 'Invalid anomaly ID format'
                })
        });

        const { error } = schema.validate({ id: req.params.id });

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        next();
    };

    /**
     * Validate alert ID parameter
     */
    validateAlertId = (req, res, next) => {
        const schema = Joi.object({
            alertId: Joi.string()
                .regex(/^[0-9a-fA-F]{24}$/)
                .required()
                .messages({
                    'string.pattern.base': 'Invalid alert ID format'
                })
        });

        const { error } = schema.validate({ alertId: req.params.alertId });

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        next();
    };

    /**
     * Validate forecast query parameters
     */
    validateForecastQuery = (req, res, next) => {
        const schema = Joi.object({
            category: Joi.string()
                .trim()
                .min(1)
                .max(50)
                .optional(),
            period_type: Joi.string()
                .valid('weekly', 'monthly', 'quarterly', 'yearly')
                .optional(),
            limit: Joi.number()
                .integer()
                .min(1)
                .max(100)
                .default(50)
                .optional(),
            page: Joi.number()
                .integer()
                .min(1)
                .default(1)
                .optional()
        });

        const { error, value } = schema.validate(req.query);

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        req.query = value;
        next();
    };

    /**
     * Validate anomaly query parameters
     */
    validateAnomalyQuery = (req, res, next) => {
        const schema = Joi.object({
            severity: Joi.string()
                .valid('low', 'medium', 'high', 'critical')
                .optional(),
            unreviewed: Joi.boolean()
                .optional(),
            potential_fraud: Joi.boolean()
                .optional(),
            limit: Joi.number()
                .integer()
                .min(1)
                .max(100)
                .default(50)
                .optional(),
            page: Joi.number()
                .integer()
                .min(1)
                .default(1)
                .optional()
        });

        const { error, value } = schema.validate(req.query);

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        req.query = value;
        next();
    };

    /**
     * Validate analytics query parameters
     */
    validateAnalyticsQuery = (req, res, next) => {
        const schema = Joi.object({
            period: Joi.number()
                .integer()
                .min(1)
                .max(365)
                .default(30)
                .optional(),
            type: Joi.string()
                .valid('expense_forecast', 'income_forecast', 'budget_forecast')
                .default('expense_forecast')
                .optional(),
            periods: Joi.number()
                .integer()
                .min(1)
                .max(12)
                .default(3)
                .optional()
        });

        const { error, value } = schema.validate(req.query);

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        req.query = value;
        next();
    };

    /**
     * Validate seasonal patterns query
     */
    validateSeasonalQuery = (req, res, next) => {
        const schema = Joi.object({
            category: Joi.string()
                .trim()
                .min(1)
                .max(50)
                .optional()
        });

        const { error, value } = schema.validate(req.query);

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        req.query = value;
        next();
    };

    /**
     * Validate alerts query
     */
    validateAlertsQuery = (req, res, next) => {
        const schema = Joi.object({
            severity: Joi.string()
                .valid('low', 'medium', 'high', 'critical')
                .optional(),
            acknowledged: Joi.boolean()
                .optional(),
            limit: Joi.number()
                .integer()
                .min(1)
                .max(100)
                .default(50)
                .optional()
        });

        const { error, value } = schema.validate(req.query);

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        req.query = value;
        next();
    };
}

module.exports = new ForecastValidator();
