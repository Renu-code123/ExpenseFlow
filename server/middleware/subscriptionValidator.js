const Joi = require('joi');

// Schema for creating a subscription
const createSubscriptionSchema = Joi.object({
    name: Joi.string().trim().max(100).required()
        .messages({
            'string.empty': 'Subscription name is required',
            'string.max': 'Name must be less than 100 characters'
        }),
    description: Joi.string().trim().max(500).allow('').optional(),
    amount: Joi.number().min(0.01).required()
        .messages({
            'number.min': 'Amount must be at least 0.01',
            'number.base': 'Amount must be a valid number'
        }),
    currency: Joi.string().uppercase().length(3).default('INR'),
    category: Joi.string().valid(
        'streaming', 'music', 'gaming', 'software', 'productivity',
        'fitness', 'news', 'education', 'cloud_storage', 'food_delivery',
        'transportation', 'insurance', 'utilities', 'membership', 'other'
    ).required()
        .messages({
            'any.only': 'Invalid category selected'
        }),
    billingCycle: Joi.string().valid(
        'weekly', 'biweekly', 'monthly', 'quarterly', 'semi_annual', 'yearly'
    ).required()
        .messages({
            'any.only': 'Invalid billing cycle selected'
        }),
    nextPaymentDate: Joi.date().required()
        .messages({
            'date.base': 'Invalid next payment date'
        }),
    startDate: Joi.date().optional(),
    endDate: Joi.date().greater(Joi.ref('startDate')).allow(null).optional()
        .messages({
            'date.greater': 'End date must be after start date'
        }),
    trialEndDate: Joi.date().allow(null).optional(),
    provider: Joi.string().trim().max(100).allow('').optional(),
    website: Joi.string().trim().max(200).uri().allow('').optional(),
    paymentMethod: Joi.string().trim().max(50).allow('').optional(),
    reminderEnabled: Joi.boolean().default(true),
    reminderDaysBefore: Joi.number().min(1).max(30).default(3)
        .messages({
            'number.min': 'Reminder days must be at least 1',
            'number.max': 'Reminder days cannot exceed 30'
        }),
    usageFrequency: Joi.string().valid(
        'daily', 'weekly', 'monthly', 'rarely', 'never', 'unknown'
    ).default('unknown'),
    notes: Joi.string().trim().max(1000).allow('').optional(),
    tags: Joi.array().items(Joi.string().trim().max(30)).max(10).optional(),
    color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional()
        .messages({
            'string.pattern.base': 'Color must be a valid hex color (e.g., #667eea)'
        }),
    logo: Joi.string().trim().allow('').optional()
});

// Schema for updating a subscription
const updateSubscriptionSchema = Joi.object({
    name: Joi.string().trim().max(100).optional(),
    description: Joi.string().trim().max(500).allow('').optional(),
    amount: Joi.number().min(0.01).optional(),
    currency: Joi.string().uppercase().length(3).optional(),
    category: Joi.string().valid(
        'streaming', 'music', 'gaming', 'software', 'productivity',
        'fitness', 'news', 'education', 'cloud_storage', 'food_delivery',
        'transportation', 'insurance', 'utilities', 'membership', 'other'
    ).optional(),
    billingCycle: Joi.string().valid(
        'weekly', 'biweekly', 'monthly', 'quarterly', 'semi_annual', 'yearly'
    ).optional(),
    nextPaymentDate: Joi.date().optional(),
    endDate: Joi.date().allow(null).optional(),
    trialEndDate: Joi.date().allow(null).optional(),
    provider: Joi.string().trim().max(100).allow('').optional(),
    website: Joi.string().trim().max(200).uri().allow('').optional(),
    status: Joi.string().valid('active', 'paused', 'cancelled', 'trial', 'expired').optional(),
    paymentMethod: Joi.string().trim().max(50).allow('').optional(),
    reminderEnabled: Joi.boolean().optional(),
    reminderDaysBefore: Joi.number().min(1).max(30).optional(),
    lastUsedDate: Joi.date().optional(),
    usageFrequency: Joi.string().valid(
        'daily', 'weekly', 'monthly', 'rarely', 'never', 'unknown'
    ).optional(),
    notes: Joi.string().trim().max(1000).allow('').optional(),
    tags: Joi.array().items(Joi.string().trim().max(30)).max(10).optional(),
    color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional(),
    logo: Joi.string().trim().allow('').optional()
}).min(1).messages({
    'object.min': 'At least one field must be provided for update'
});

// Middleware for validating create request
const validateSubscriptionCreate = (req, res, next) => {
    const { error, value } = createSubscriptionSchema.validate(req.body, {
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

    req.validatedBody = value;
    next();
};

// Middleware for validating update request
const validateSubscriptionUpdate = (req, res, next) => {
    const { error, value } = updateSubscriptionSchema.validate(req.body, {
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

    req.validatedBody = value;
    next();
};

// Validate MongoDB ObjectId
const validateObjectId = (req, res, next) => {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ error: 'Invalid ID format' });
    }

    next();
};

module.exports = {
    validateSubscriptionCreate,
    validateSubscriptionUpdate,
    validateObjectId,
    createSubscriptionSchema,
    updateSubscriptionSchema
};
