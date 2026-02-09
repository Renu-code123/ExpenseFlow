const Joi = require('joi');

// Validation for marking insight as read
const markAsReadSchema = Joi.object({
    insightId: Joi.string()
        .required()
        .regex(/^[0-9a-fA-F]{24}$/)
        .messages({
            'string.pattern.base': 'Invalid insight ID format'
        })
});

// Validation for marking insight as actioned
const markAsActionedSchema = Joi.object({
    insightId: Joi.string()
        .required()
        .regex(/^[0-9a-fA-F]{24}$/),
    action: Joi.string()
        .trim()
        .max(200)
        .required()
        .messages({
            'string.max': 'Action description must not exceed 200 characters'
        })
});

// Validation for subscription creation
const createSubscriptionSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required(),
    merchant: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required(),
    category: Joi.string()
        .valid('food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other')
        .required(),
    amount: Joi.number()
        .min(0.01)
        .required(),
    billing_cycle: Joi.string()
        .valid('daily', 'weekly', 'monthly', 'quarterly', 'yearly')
        .required(),
    next_billing_date: Joi.date()
        .iso()
        .min('now')
        .required(),
    notes: Joi.string()
        .trim()
        .max(500)
        .optional()
});

// Validation for subscription update
const updateSubscriptionSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    amount: Joi.number().min(0.01).optional(),
    billing_cycle: Joi.string().valid('daily', 'weekly', 'monthly', 'quarterly', 'yearly').optional(),
    next_billing_date: Joi.date().iso().optional(),
    status: Joi.string().valid('active', 'cancelled', 'paused', 'trial').optional(),
    notes: Joi.string().trim().max(500).optional()
});

// Validation for insight filters
const insightFilterSchema = Joi.object({
    type: Joi.string()
        .valid('anomaly', 'pattern', 'forecast', 'recommendation', 'health_score', 'subscription_alert', 'bill_optimization', 'peer_comparison')
        .optional(),
    severity: Joi.string()
        .valid('low', 'medium', 'high', 'critical')
        .optional(),
    category: Joi.string()
        .valid('food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other')
        .optional(),
    isRead: Joi.boolean().optional(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    page: Joi.number().integer().min(1).default(1)
});

/**
 * Middleware to validate insight filters
 */
const validateInsightFilters = (req, res, next) => {
    const { error } = insightFilterSchema.validate(req.query);
    
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    
    next();
};

/**
 * Middleware to validate mark as read
 */
const validateMarkAsRead = (req, res, next) => {
    const { error } = markAsReadSchema.validate({ insightId: req.params.id });
    
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    
    next();
};

/**
 * Middleware to validate mark as actioned
 */
const validateMarkAsActioned = (req, res, next) => {
    const { error } = markAsActionedSchema.validate({
        insightId: req.params.id,
        action: req.body.action
    });
    
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    
    next();
};

/**
 * Middleware to validate subscription creation
 */
const validateCreateSubscription = (req, res, next) => {
    const { error } = createSubscriptionSchema.validate(req.body);
    
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    
    next();
};

/**
 * Middleware to validate subscription update
 */
const validateUpdateSubscription = (req, res, next) => {
    const { error } = updateSubscriptionSchema.validate(req.body);
    
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    
    next();
};

/**
 * Middleware to validate subscription ID
 */
const validateSubscriptionId = (req, res, next) => {
    const { id } = req.params;
    
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid subscription ID format'
        });
    }
    
    next();
};

module.exports = {
    validateInsightFilters,
    validateMarkAsRead,
    validateMarkAsActioned,
    validateCreateSubscription,
    validateUpdateSubscription,
    validateSubscriptionId
};
