const Joi = require('joi');

// Validation schemas
const taxProfileSchema = Joi.object({
    primary_jurisdiction: Joi.object({
        country: Joi.string().valid('US', 'UK', 'EU', 'IN', 'CA').required(),
        state_province: Joi.string().allow('').optional(),
        tax_year: Joi.number().min(2020).max(2030).optional()
    }).required(),
    filing_status: Joi.string().valid('single', 'married_joint', 'married_separate', 'head_of_household', 'widow').required(),
    dependents: Joi.number().min(0).default(0),
    annual_income: Joi.object({
        salary: Joi.number().min(0).default(0),
        business: Joi.number().min(0).default(0),
        investment: Joi.number().min(0).default(0),
        rental: Joi.number().min(0).default(0),
        other: Joi.number().min(0).default(0)
    }).optional(),
    tax_advantaged_accounts: Joi.array().items(Joi.object({
        account_type: Joi.string().valid('401k', 'IRA', 'Roth_IRA', 'HSA', 'ISA', 'RRSP', 'TFSA', 'PPF', 'EPF', 'NPS').required(),
        contribution_limit: Joi.number().min(0).required(),
        current_contribution: Joi.number().min(0).default(0),
        employer_match: Joi.number().min(0).default(0)
    })).optional(),
    deductions: Joi.object({
        standard_or_itemized: Joi.string().valid('standard', 'itemized').default('standard'),
        itemized_deductions: Joi.object({
            mortgage_interest: Joi.number().min(0).default(0),
            property_tax: Joi.number().min(0).default(0),
            charitable: Joi.number().min(0).default(0),
            medical: Joi.number().min(0).default(0),
            state_local_tax: Joi.number().min(0).default(0)
        }).optional(),
        business_expenses: Joi.object({
            home_office: Joi.number().min(0).default(0),
            travel: Joi.number().min(0).default(0),
            equipment: Joi.number().min(0).default(0),
            supplies: Joi.number().min(0).default(0),
            professional_services: Joi.number().min(0).default(0)
        }).optional()
    }).optional(),
    tax_preferences: Joi.object({
        risk_tolerance: Joi.string().valid('conservative', 'moderate', 'aggressive').default('moderate'),
        enable_tax_loss_harvesting: Joi.boolean().default(true),
        enable_wash_sale_detection: Joi.boolean().default(true),
        enable_quarterly_estimates: Joi.boolean().default(false),
        preferred_payment_method: Joi.string().valid('bank_transfer', 'check', 'credit_card').default('bank_transfer')
    }).optional(),
    tax_professional: Joi.object({
        has_professional: Joi.boolean().default(false),
        name: Joi.string().allow('').optional(),
        firm: Joi.string().allow('').optional(),
        contact: Joi.string().allow('').optional(),
        notes: Joi.string().allow('').optional()
    }).optional()
});

const taxDocumentSchema = Joi.object({
    document_type: Joi.string().valid(
        '1099_INT', '1099_DIV', '1099_B', 'Schedule_D', 'Schedule_C', 'Form_8949',
        'P60', 'P11D', 'SA100', 'T4', 'T5', 'ITR', 'Form_16', 'Form_26AS',
        'Tax_Summary', 'Estimated_Tax', 'Year_End_Report'
    ).required(),
    tax_year: Joi.number().min(2020).max(2030).required()
});

const estimatedPaymentSchema = Joi.object({
    quarter: Joi.number().min(1).max(4).required(),
    confirmation_number: Joi.string().required().min(5).max(50)
});

const taxRuleSchema = Joi.object({
    jurisdiction: Joi.object({
        country: Joi.string().valid('US', 'UK', 'EU', 'IN', 'CA').required(),
        state_province: Joi.string().allow('').optional(),
        tax_year: Joi.number().min(2020).max(2030).required()
    }).required(),
    rule_type: Joi.string().valid('income_tax', 'capital_gains', 'deduction', 'credit', 'wash_sale', 'contribution_limit').required(),
    isActive: Joi.boolean().default(true)
});

// Validation middleware
const validateTaxProfile = (req, res, next) => {
    const { error } = taxProfileSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            details: error.details[0].message
        });
    }
    next();
};

const validateTaxDocument = (req, res, next) => {
    const { error } = taxDocumentSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            details: error.details[0].message
        });
    }
    next();
};

const validateEstimatedPayment = (req, res, next) => {
    const { error } = estimatedPaymentSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            details: error.details[0].message
        });
    }
    next();
};

const validateTaxRule = (req, res, next) => {
    const { error } = taxRuleSchema.validate(req.body);
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
    validateTaxProfile,
    validateTaxDocument,
    validateEstimatedPayment,
    validateTaxRule
};
