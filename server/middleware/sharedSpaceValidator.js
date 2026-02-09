const Joi = require('joi');

// Validation schemas
const sharedSpaceSchema = Joi.object({
    name: Joi.string().required().min(3).max(100).trim(),
    description: Joi.string().max(500).trim().allow(''),
    type: Joi.string().valid('family', 'couple', 'roommates', 'business', 'friends', 'other').required(),
    settings: Joi.object({
        currency: Joi.string().uppercase().default('INR'),
        require_approval_above: Joi.number().min(0).default(10000),
        approval_threshold_count: Joi.number().min(1).default(1),
        privacy_mode: Joi.string().valid('open', 'restricted', 'private').default('open'),
        enable_notifications: Joi.boolean().default(true),
        notification_channels: Joi.array().items(Joi.string().valid('email', 'push', 'sms'))
    }).optional()
});

const memberSchema = Joi.object({
    user_id: Joi.string().required(),
    role: Joi.string().valid('admin', 'manager', 'contributor', 'viewer').required(),
    permissions: Joi.object({
        view_expenses: Joi.boolean(),
        add_expenses: Joi.boolean(),
        edit_expenses: Joi.boolean(),
        delete_expenses: Joi.boolean(),
        view_goals: Joi.boolean(),
        manage_goals: Joi.boolean(),
        view_budgets: Joi.boolean(),
        manage_budgets: Joi.boolean(),
        approve_expenses: Joi.boolean(),
        manage_members: Joi.boolean(),
        view_reports: Joi.boolean()
    }).optional(),
    privacy_settings: Joi.object({
        hide_personal_transactions: Joi.boolean().default(false),
        hide_income: Joi.boolean().default(false),
        hide_savings: Joi.boolean().default(false)
    }).optional(),
    notification_preferences: Joi.object({
        new_expense: Joi.boolean().default(true),
        goal_progress: Joi.boolean().default(true),
        budget_alert: Joi.boolean().default(true),
        approval_request: Joi.boolean().default(true),
        member_activity: Joi.boolean().default(false)
    }).optional()
});

const goalSchema = Joi.object({
    name: Joi.string().required().min(3).max(100).trim(),
    description: Joi.string().max(500).trim().allow(''),
    target_amount: Joi.number().required().min(1),
    currency: Joi.string().uppercase().default('INR'),
    deadline: Joi.date().min('now').optional(),
    category: Joi.string().valid('savings', 'investment', 'purchase', 'vacation', 'emergency', 'education', 'other').default('savings'),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    visibility: Joi.string().valid('all', 'contributors', 'admins').default('all'),
    auto_allocate: Joi.boolean().default(false),
    allocation_rule: Joi.string().valid('equal', 'proportional', 'custom').default('equal'),
    contributors: Joi.array().items(Joi.object({
        user: Joi.string().required(),
        target_contribution: Joi.number().min(0).default(0)
    })).optional(),
    milestone_alerts: Joi.array().items(Joi.object({
        percentage: Joi.number().min(0).max(100).required()
    })).optional()
});

const contributionSchema = Joi.object({
    amount: Joi.number().required().min(1),
    note: Joi.string().max(200).trim().allow(''),
    transaction_id: Joi.string().optional()
});

const approvalRequestSchema = Joi.object({
    expense_data: Joi.object({
        description: Joi.string().required().min(3).max(200).trim(),
        amount: Joi.number().required().min(1),
        category: Joi.string().required(),
        date: Joi.date().max('now').optional(),
        notes: Joi.string().max(500).trim().allow(''),
        receipt_url: Joi.string().uri().optional()
    }).required(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium')
});

const approvalDecisionSchema = Joi.object({
    comment: Joi.string().max(500).trim().allow('')
});

// Validation middleware
const validateSharedSpace = (req, res, next) => {
    const { error } = sharedSpaceSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            details: error.details[0].message
        });
    }
    next();
};

const validateMember = (req, res, next) => {
    const { error } = memberSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            details: error.details[0].message
        });
    }
    next();
};

const validateGoal = (req, res, next) => {
    const { error } = goalSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            details: error.details[0].message
        });
    }
    next();
};

const validateContribution = (req, res, next) => {
    const { error } = contributionSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            details: error.details[0].message
        });
    }
    next();
};

const validateApproval = (req, res, next) => {
    const { error } = approvalRequestSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            details: error.details[0].message
        });
    }
    next();
};

const validateApprovalDecision = (req, res, next) => {
    const { error } = approvalDecisionSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            details: error.details[0].message
        });
    }
    next();
};

module.exports = {
    validateSharedSpace,
    validateMember,
    validateGoal,
    validateContribution,
    validateApproval,
    validateApprovalDecision
};
