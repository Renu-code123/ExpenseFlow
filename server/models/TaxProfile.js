const mongoose = require('mongoose');

const taxProfileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    primary_jurisdiction: {
        country: {
            type: String,
            enum: ['US', 'UK', 'EU', 'IN', 'CA'],
            required: true
        },
        state_province: String, // For US states, Canadian provinces, etc.
        tax_year: {
            type: Number,
            default: () => new Date().getFullYear()
        }
    },
    filing_status: {
        type: String,
        enum: ['single', 'married_joint', 'married_separate', 'head_of_household', 'widow'],
        default: 'single'
    },
    dependents: {
        type: Number,
        default: 0,
        min: 0
    },
    annual_income: {
        salary: { type: Number, default: 0 },
        business: { type: Number, default: 0 },
        investment: { type: Number, default: 0 },
        rental: { type: Number, default: 0 },
        other: { type: Number, default: 0 }
    },
    tax_advantaged_accounts: [{
        account_type: {
            type: String,
            enum: ['401k', 'IRA', 'Roth_IRA', 'HSA', 'ISA', 'RRSP', 'TFSA', 'PPF', 'EPF', 'NPS']
        },
        contribution_limit: Number,
        current_contribution: { type: Number, default: 0 },
        employer_match: { type: Number, default: 0 }
    }],
    deductions: {
        standard_or_itemized: {
            type: String,
            enum: ['standard', 'itemized'],
            default: 'standard'
        },
        itemized_deductions: {
            mortgage_interest: { type: Number, default: 0 },
            property_tax: { type: Number, default: 0 },
            charitable: { type: Number, default: 0 },
            medical: { type: Number, default: 0 },
            state_local_tax: { type: Number, default: 0 }
        },
        business_expenses: {
            home_office: { type: Number, default: 0 },
            travel: { type: Number, default: 0 },
            equipment: { type: Number, default: 0 },
            supplies: { type: Number, default: 0 },
            professional_services: { type: Number, default: 0 }
        }
    },
    tax_preferences: {
        risk_tolerance: {
            type: String,
            enum: ['conservative', 'moderate', 'aggressive'],
            default: 'moderate'
        },
        enable_tax_loss_harvesting: { type: Boolean, default: true },
        enable_wash_sale_detection: { type: Boolean, default: true },
        enable_quarterly_estimates: { type: Boolean, default: false },
        preferred_payment_method: {
            type: String,
            enum: ['bank_transfer', 'check', 'credit_card'],
            default: 'bank_transfer'
        }
    },
    estimated_tax_payments: [{
        quarter: { type: Number, min: 1, max: 4 },
        due_date: Date,
        amount: Number,
        paid: { type: Boolean, default: false },
        paid_date: Date,
        confirmation_number: String
    }],
    tax_bracket_info: {
        federal_bracket: Number,
        state_bracket: Number,
        effective_tax_rate: Number,
        marginal_tax_rate: Number
    },
    year_end_strategy: {
        harvest_losses_before: Date,
        max_contributions_by: Date,
        charitable_giving_deadline: Date,
        business_expense_deadline: Date
    },
    tax_professional: {
        has_professional: { type: Boolean, default: false },
        name: String,
        firm: String,
        contact: String,
        notes: String
    },
    audit_settings: {
        enable_audit_trail: { type: Boolean, default: true },
        retention_years: { type: Number, default: 7 },
        digital_copies: { type: Boolean, default: true }
    }
}, {
    timestamps: true
});

// Virtuals
taxProfileSchema.virtual('total_annual_income').get(function() {
    return Object.values(this.annual_income).reduce((sum, val) => sum + val, 0);
});

taxProfileSchema.virtual('total_itemized_deductions').get(function() {
    const itemized = Object.values(this.deductions.itemized_deductions).reduce((sum, val) => sum + val, 0);
    const business = Object.values(this.deductions.business_expenses).reduce((sum, val) => sum + val, 0);
    return itemized + business;
});

taxProfileSchema.virtual('total_tax_advantaged_contributions').get(function() {
    return this.tax_advantaged_accounts.reduce((sum, acc) => sum + acc.current_contribution, 0);
});

// Methods
taxProfileSchema.methods.updateTaxBracket = function(federalBracket, stateBracket, effectiveRate, marginalRate) {
    this.tax_bracket_info = {
        federal_bracket: federalBracket,
        state_bracket: stateBracket,
        effective_tax_rate: effectiveRate,
        marginal_tax_rate: marginalRate
    };
    return this.save();
};

taxProfileSchema.methods.addEstimatedPayment = function(quarter, dueDate, amount) {
    this.estimated_tax_payments.push({
        quarter,
        due_date: dueDate,
        amount,
        paid: false
    });
    return this.save();
};

taxProfileSchema.methods.markPaymentPaid = function(quarter, confirmationNumber) {
    const payment = this.estimated_tax_payments.find(p => p.quarter === quarter);
    if (payment) {
        payment.paid = true;
        payment.paid_date = new Date();
        payment.confirmation_number = confirmationNumber;
    }
    return this.save();
};

taxProfileSchema.methods.shouldItemize = function(standardDeduction) {
    return this.total_itemized_deductions > standardDeduction;
};

// Static methods
taxProfileSchema.statics.getUserProfile = function(userId) {
    return this.findOne({ user: userId });
};

taxProfileSchema.statics.getProfilesNeedingQuarterlyEstimates = function() {
    return this.find({
        'tax_preferences.enable_quarterly_estimates': true,
        'estimated_tax_payments': {
            $elemMatch: {
                paid: false,
                due_date: {
                    $gte: new Date(),
                    $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Next 30 days
                }
            }
        }
    }).populate('user', 'name email');
};

module.exports = mongoose.model('TaxProfile', taxProfileSchema);
