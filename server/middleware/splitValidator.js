const Joi = require('joi');

// Group validation schemas
const groupSchemas = {
    createGroup: Joi.object({
        name: Joi.string().trim().max(100).required(),
        description: Joi.string().trim().max(500).optional(),
        category: Joi.string().valid('trip', 'home', 'couple', 'friends', 'project', 'event', 'other').optional(),
        icon: Joi.string().optional(),
        currency: Joi.string().uppercase().length(3).optional(),
        members: Joi.array().items(
            Joi.object({
                userId: Joi.string().required(),
                name: Joi.string().required(),
                email: Joi.string().email().required()
            })
        ).min(2).required(),
        simplifyDebts: Joi.boolean().optional()
    }),

    updateGroup: Joi.object({
        name: Joi.string().trim().max(100).optional(),
        description: Joi.string().trim().max(500).optional(),
        category: Joi.string().valid('trip', 'home', 'couple', 'friends', 'project', 'event', 'other').optional(),
        icon: Joi.string().optional(),
        simplifyDebts: Joi.boolean().optional()
    }),

    addMember: Joi.object({
        userId: Joi.string().required(),
        name: Joi.string().required(),
        email: Joi.string().email().required()
    })
};

// Split expense validation schemas
const splitSchemas = {
    createSplit: Joi.object({
        description: Joi.string().trim().max(200).required(),
        totalAmount: Joi.number().min(0.01).required(),
        currency: Joi.string().uppercase().length(3).optional(),
        category: Joi.string().valid('food', 'transport', 'entertainment', 'utilities', 'shopping', 'accommodation', 'other').optional(),
        date: Joi.date().optional(),
        splitType: Joi.string().valid('equal', 'exact', 'percentage', 'shares').required(),
        groupId: Joi.string().optional(),
        members: Joi.array().items(
            Joi.object({
                userId: Joi.string().required(),
                name: Joi.string().required(),
                email: Joi.string().email().required()
            })
        ).min(2).required(),
        splitData: Joi.object({
            amounts: Joi.array().items(Joi.number().min(0)).optional(),
            percentages: Joi.array().items(Joi.number().min(0).max(100)).optional(),
            shares: Joi.array().items(Joi.number().min(0)).optional()
        }).optional(),
        notes: Joi.string().trim().max(500).optional()
    }),

    recordSettlement: Joi.object({
        paidToUserId: Joi.string().required(),
        amount: Joi.number().min(0.01).required(),
        currency: Joi.string().uppercase().length(3).optional(),
        groupId: Joi.string().optional(),
        method: Joi.string().valid('cash', 'bank_transfer', 'upi', 'credit_card', 'paypal', 'venmo', 'other').optional(),
        transactionId: Joi.string().trim().optional(),
        notes: Joi.string().trim().max(500).optional(),
        relatedExpenses: Joi.array().items(Joi.string()).optional()
    })
};

// Middleware functions
const validateGroupCreation = (req, res, next) => {
    const { error } = groupSchemas.createGroup.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            error: error.details[0].message
        });
    }
    next();
};

const validateGroupUpdate = (req, res, next) => {
    const { error } = groupSchemas.updateGroup.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            error: error.details[0].message
        });
    }
    next();
};

const validateAddMember = (req, res, next) => {
    const { error } = groupSchemas.addMember.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            error: error.details[0].message
        });
    }
    next();
};

const validateSplitCreation = (req, res, next) => {
    const { error } = splitSchemas.createSplit.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            error: error.details[0].message
        });
    }

    // Additional validation based on split type
    const { splitType, splitData, members } = req.body;

    if (splitType === 'exact' && (!splitData || !splitData.amounts || splitData.amounts.length !== members.length)) {
        return res.status(400).json({
            success: false,
            message: 'Exact split requires amounts for all members'
        });
    }

    if (splitType === 'percentage' && (!splitData || !splitData.percentages || splitData.percentages.length !== members.length)) {
        return res.status(400).json({
            success: false,
            message: 'Percentage split requires percentages for all members'
        });
    }

    if (splitType === 'shares' && (!splitData || !splitData.shares || splitData.shares.length !== members.length)) {
        return res.status(400).json({
            success: false,
            message: 'Shares split requires shares for all members'
        });
    }

    next();
};

const validateSettlement = (req, res, next) => {
    const { error } = splitSchemas.recordSettlement.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            error: error.details[0].message
        });
    }
    next();
};

module.exports = {
    validateGroupCreation,
    validateGroupUpdate,
    validateAddMember,
    validateSplitCreation,
    validateSettlement
};
