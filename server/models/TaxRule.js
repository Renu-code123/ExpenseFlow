const mongoose = require('mongoose');

const taxRuleSchema = new mongoose.Schema({
    jurisdiction: {
        country: {
            type: String,
            enum: ['US', 'UK', 'EU', 'IN', 'CA'],
            required: true
        },
        state_province: String,
        tax_year: {
            type: Number,
            required: true
        }
    },
    rule_type: {
        type: String,
        enum: ['income_tax', 'capital_gains', 'deduction', 'credit', 'wash_sale', 'contribution_limit'],
        required: true
    },
    income_tax_brackets: [{
        filing_status: String,
        brackets: [{
            min_income: Number,
            max_income: Number,
            rate: Number // Percentage
        }]
    }],
    capital_gains_rules: {
        short_term: {
            holding_period_days: { type: Number, default: 365 },
            tax_treatment: {
                type: String,
                enum: ['ordinary_income', 'special_rate'],
                default: 'ordinary_income'
            },
            rate: Number
        },
        long_term: {
            holding_period_days: { type: Number, default: 365 },
            brackets: [{
                min_income: Number,
                max_income: Number,
                rate: Number
            }]
        }
    },
    standard_deduction: [{
        filing_status: String,
        amount: Number,
        additional_age_65: Number,
        additional_blind: Number
    }],
    deduction_rules: [{
        category: String,
        max_amount: Number,
        percentage_limit: Number, // % of AGI
        phase_out_start: Number,
        phase_out_end: Number,
        requirements: [String]
    }],
    tax_credits: [{
        credit_name: String,
        max_credit: Number,
        income_limit: Number,
        refundable: Boolean,
        eligibility_criteria: [String]
    }],
    wash_sale_rules: {
        enabled: { type: Boolean, default: true },
        days_before: { type: Number, default: 30 },
        days_after: { type: Number, default: 30 },
        substantially_identical: [String]
    },
    contribution_limits: [{
        account_type: String,
        annual_limit: Number,
        age_50_catchup: Number,
        income_phase_out_start: Number,
        income_phase_out_end: Number,
        employer_match_limit: Number
    }],
    business_expense_rules: [{
        category: String,
        deductible_percentage: Number,
        documentation_required: [String],
        limitations: String
    }],
    estimated_tax_requirements: {
        quarterly: {
            enabled: Boolean,
            minimum_income: Number,
            safe_harbor_percentage: Number, // % of prior year tax or current year
            due_dates: [{
                quarter: Number,
                month: Number,
                day: Number
            }]
        }
    },
    depreciation_rules: [{
        asset_class: String,
        method: String, // straight-line, declining-balance, Section 179
        useful_life_years: Number,
        bonus_depreciation_percentage: Number,
        section_179_limit: Number
    }],
    foreign_tax_credit: {
        enabled: Boolean,
        credit_or_deduction: String,
        limitations: String
    },
    alternative_minimum_tax: {
        enabled: Boolean,
        exemption_amount: Number,
        rate: Number,
        phase_out_threshold: Number
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Indexes
taxRuleSchema.index({ 'jurisdiction.country': 1, 'jurisdiction.tax_year': 1, rule_type: 1 });
taxRuleSchema.index({ 'jurisdiction.country': 1, 'jurisdiction.state_province': 1, 'jurisdiction.tax_year': 1 });

// Methods
taxRuleSchema.methods.getTaxBracket = function(income, filingStatus) {
    const statusBrackets = this.income_tax_brackets.find(b => b.filing_status === filingStatus);
    if (!statusBrackets) return null;
    
    for (let bracket of statusBrackets.brackets) {
        if (income >= bracket.min_income && income <= bracket.max_income) {
            return bracket;
        }
    }
    
    // Return highest bracket if income exceeds all brackets
    return statusBrackets.brackets[statusBrackets.brackets.length - 1];
};

taxRuleSchema.methods.calculateTax = function(income, filingStatus) {
    const statusBrackets = this.income_tax_brackets.find(b => b.filing_status === filingStatus);
    if (!statusBrackets) return 0;
    
    let tax = 0;
    let remainingIncome = income;
    
    for (let bracket of statusBrackets.brackets) {
        const bracketIncome = Math.min(
            remainingIncome,
            bracket.max_income - bracket.min_income
        );
        
        if (bracketIncome > 0) {
            tax += bracketIncome * (bracket.rate / 100);
            remainingIncome -= bracketIncome;
        }
        
        if (remainingIncome <= 0) break;
    }
    
    return tax;
};

taxRuleSchema.methods.getStandardDeduction = function(filingStatus) {
    const deduction = this.standard_deduction.find(d => d.filing_status === filingStatus);
    return deduction ? deduction.amount : 0;
};

taxRuleSchema.methods.getCapitalGainsRate = function(holdingDays, income, filingStatus) {
    if (holdingDays < this.capital_gains_rules.short_term.holding_period_days) {
        // Short-term: taxed as ordinary income
        const bracket = this.getTaxBracket(income, filingStatus);
        return bracket ? bracket.rate : 0;
    } else {
        // Long-term: special rates
        const brackets = this.capital_gains_rules.long_term.brackets;
        for (let bracket of brackets) {
            if (income >= bracket.min_income && income <= bracket.max_income) {
                return bracket.rate;
            }
        }
        return brackets[brackets.length - 1].rate;
    }
};

taxRuleSchema.methods.getContributionLimit = function(accountType) {
    const limit = this.contribution_limits.find(c => c.account_type === accountType);
    return limit || null;
};

taxRuleSchema.methods.isWashSale = function(saleDate, purchaseDate) {
    if (!this.wash_sale_rules.enabled) return false;
    
    const daysDiff = Math.abs((saleDate - purchaseDate) / (1000 * 60 * 60 * 24));
    const windowDays = this.wash_sale_rules.days_before + this.wash_sale_rules.days_after;
    
    return daysDiff <= windowDays;
};

// Static methods
taxRuleSchema.statics.getCurrentRules = function(country, stateProvince = null) {
    const currentYear = new Date().getFullYear();
    const query = {
        'jurisdiction.country': country,
        'jurisdiction.tax_year': currentYear,
        isActive: true
    };
    
    if (stateProvince) {
        query['jurisdiction.state_province'] = stateProvince;
    }
    
    return this.find(query);
};

taxRuleSchema.statics.getRulesByType = function(country, ruleType, taxYear = null) {
    const year = taxYear || new Date().getFullYear();
    return this.findOne({
        'jurisdiction.country': country,
        'jurisdiction.tax_year': year,
        rule_type: ruleType,
        isActive: true
    });
};

module.exports = mongoose.model('TaxRule', taxRuleSchema);
