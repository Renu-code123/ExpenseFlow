const Joi = require('joi');

// Joi schema for category suggestion
const suggestCategorySchema = Joi.object({
    description: Joi.string()
        .trim()
        .min(2)
        .max(500)
        .required()
        .messages({
            'string.min': 'Description must be at least 2 characters',
            'string.max': 'Description must not exceed 500 characters',
            'any.required': 'Description is required'
        })
});

// Joi schema for training/correction
const trainCategorySchema = Joi.object({
    description: Joi.string()
        .trim()
        .min(2)
        .max(500)
        .required(),
    suggestedCategory: Joi.string()
        .valid('food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other')
        .required(),
    actualCategory: Joi.string()
        .valid('food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other')
        .required()
        .messages({
            'any.only': 'Invalid category. Must be one of: food, transport, entertainment, utilities, healthcare, shopping, other'
        })
});

// Joi schema for bulk categorization
const bulkCategorizeSchema = Joi.object({
    expenses: Joi.array()
        .items(
            Joi.object({
                id: Joi.string(),
                _id: Joi.string(),
                description: Joi.string().required()
            })
        )
        .min(1)
        .max(100)
        .required()
        .messages({
            'array.min': 'At least one expense is required',
            'array.max': 'Cannot categorize more than 100 expenses at once'
        })
});

/**
 * Middleware to validate category suggestion request
 */
const validateSuggestCategory = (req, res, next) => {
    const { error } = suggestCategorySchema.validate(req.query);
    
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    
    next();
};

/**
 * Middleware to validate training request
 */
const validateTrainCategory = (req, res, next) => {
    const { error } = trainCategorySchema.validate(req.body);
    
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    
    next();
};

/**
 * Middleware to validate bulk categorization request
 */
const validateBulkCategorize = (req, res, next) => {
    const { error } = bulkCategorizeSchema.validate(req.body);
    
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    
    next();
};

/**
 * Middleware to validate category parameter
 */
const validateCategory = (req, res, next) => {
    const validCategories = ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other'];
    const category = req.params.category || req.body.category || req.query.category;
    
    if (category && !validCategories.includes(category)) {
        return res.status(400).json({
            success: false,
            message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
        });
    }
    
    next();
};

/**
 * Middleware to validate pattern ID
 */
const validatePatternId = (req, res, next) => {
    const { patternId } = req.params;
    
    if (!patternId || !patternId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid pattern ID format'
        });
    }
    
    next();
};

module.exports = {
    validateSuggestCategory,
    validateTrainCategory,
    validateBulkCategorize,
    validateCategory,
    validatePatternId
};
