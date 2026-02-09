const Joi = require('joi');

// Schema for creating a recurring expense
const createRecurringSchema = Joi.object({
    description: Joi.string().trim().max(100).required()
        .messages({
            'string.empty': 'Description is required',
            'string.max': 'Description must be less than 100 characters'
        }),
    amount: Joi.number().min(0.01).required()
        .messages({
            'number.min': 'Amount must be at least 0.01',
            'number.base': 'Amount must be a valid number'
        }),
    category: Joi.string().valid(
        'food', 'transport', 'entertainment', 'utilities',
        'healthcare', 'shopping', 'subscription', 'rent',
        'insurance', 'other'
    ).required()
        .messages({
            'any.only': 'Invalid category selected'
        }),
    type: Joi.string().valid('income', 'expense').default('expense'),
    frequency: Joi.string().valid(
        'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'
    ).required()
        .messages({
            'any.only': 'Invalid frequency selected'
        }),
    customInterval: Joi.object({
        value: Joi.number().min(1).max(365),
        unit: Joi.string().valid('days', 'weeks', 'months', 'years')
    }).optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().greater(Joi.ref('startDate')).allow(null).optional()
        .messages({
            'date.greater': 'End date must be after start date'
        }),
    nextDueDate: Joi.date().optional(),
    autoCreate: Joi.boolean().default(true),
    reminderDays: Joi.number().min(0).max(30).default(3)
        .messages({
            'number.min': 'Reminder days cannot be negative',
            'number.max': 'Reminder days cannot exceed 30'
        }),
    notes: Joi.string().trim().max(500).allow('').optional(),
    tags: Joi.array().items(Joi.string().trim().max(50)).max(10).optional()
});

// Schema for updating a recurring expense
const updateRecurringSchema = Joi.object({
    description: Joi.string().trim().max(100).optional(),
    amount: Joi.number().min(0.01).optional(),
    category: Joi.string().valid(
        'food', 'transport', 'entertainment', 'utilities',
        'healthcare', 'shopping', 'subscription', 'rent',
        'insurance', 'other'
    ).optional(),
    type: Joi.string().valid('income', 'expense').optional(),
    frequency: Joi.string().valid(
        'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'
    ).optional(),
    customInterval: Joi.object({
        value: Joi.number().min(1).max(365),
        unit: Joi.string().valid('days', 'weeks', 'months', 'years')
    }).optional(),
    endDate: Joi.date().allow(null).optional(),
    nextDueDate: Joi.date().optional(),
    autoCreate: Joi.boolean().optional(),
    reminderDays: Joi.number().min(0).max(30).optional(),
    notes: Joi.string().trim().max(500).allow('').optional(),
    tags: Joi.array().items(Joi.string().trim().max(50)).max(10).optional(),
    isActive: Joi.boolean().optional(),
    isPaused: Joi.boolean().optional()
}).min(1).messages({
    'object.min': 'At least one field must be provided for update'
});

// Middleware for validating create request
const validateCreate = (req, res, next) => {
    const { error, value } = createRecurringSchema.validate(req.body, {
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
const validateUpdate = (req, res, next) => {
    const { error, value } = updateRecurringSchema.validate(req.body, {
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
    validateCreate,
    validateUpdate,
    validateObjectId,
    createRecurringSchema,
    updateRecurringSchema
};
