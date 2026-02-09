const mongoose = require('mongoose');

const taxDocumentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    tax_year: {
        type: Number,
        required: true,
        index: true
    },
    document_type: {
        type: String,
        enum: [
            '1099_INT',       // Interest income (US)
            '1099_DIV',       // Dividend income (US)
            '1099_B',         // Brokerage transactions (US)
            'Schedule_D',     // Capital gains (US)
            'Schedule_C',     // Business income (US)
            'Form_8949',      // Sales of capital assets (US)
            'P60',            // End of year certificate (UK)
            'P11D',           // Benefits and expenses (UK)
            'SA100',          // Self-assessment tax return (UK)
            'T4',             // Employment income (Canada)
            'T5',             // Investment income (Canada)
            'ITR',            // Income tax return (India)
            'Form_16',        // TDS certificate (India)
            'Form_26AS',      // Tax credit statement (India)
            'Tax_Summary',    // General summary
            'Estimated_Tax',  // Quarterly estimates
            'Year_End_Report' // Comprehensive report
        ],
        required: true
    },
    status: {
        type: String,
        enum: ['draft', 'generated', 'reviewed', 'filed', 'amended'],
        default: 'draft',
        index: true
    },
    filing_status: String,
    data: {
        // Income
        wages: Number,
        tips: Number,
        interest_income: Number,
        dividend_income: {
            ordinary: Number,
            qualified: Number
        },
        business_income: Number,
        capital_gains: {
            short_term: Number,
            long_term: Number
        },
        rental_income: Number,
        other_income: Number,
        
        // Deductions
        standard_deduction: Number,
        itemized_deductions: {
            mortgage_interest: Number,
            property_tax: Number,
            charitable: Number,
            medical: Number,
            state_local_tax: Number
        },
        business_expenses: {
            home_office: Number,
            travel: Number,
            equipment: Number,
            supplies: Number,
            professional_services: Number,
            depreciation: Number
        },
        retirement_contributions: Number,
        
        // Credits
        child_tax_credit: Number,
        education_credit: Number,
        earned_income_credit: Number,
        foreign_tax_credit: Number,
        
        // Transactions
        transactions: [{
            date: Date,
            description: String,
            type: String,
            cost_basis: Number,
            proceeds: Number,
            gain_loss: Number,
            holding_period: String,
            wash_sale: Boolean
        }],
        
        // Calculations
        adjusted_gross_income: Number,
        taxable_income: Number,
        total_tax: Number,
        credits_applied: Number,
        tax_withheld: Number,
        estimated_payments: Number,
        refund_or_owed: Number
    },
    transactions: [{
        expense_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Expense'
        },
        date: Date,
        description: String,
        category: String,
        amount: Number,
        tax_category: String,
        deductible_amount: Number,
        deductible_percentage: Number,
        notes: String
    }],
    capital_transactions: [{
        asset_name: String,
        purchase_date: Date,
        sale_date: Date,
        quantity: Number,
        cost_basis: Number,
        proceeds: Number,
        gain_loss: Number,
        holding_period_days: Number,
        term: { type: String, enum: ['short', 'long'] },
        wash_sale_flag: Boolean,
        adjusted_basis: Number
    }],
    optimization_suggestions: [{
        suggestion_type: {
            type: String,
            enum: [
                'tax_loss_harvest',
                'defer_income',
                'accelerate_deduction',
                'roth_conversion',
                'contribution_increase',
                'estimated_payment',
                'charitable_giving',
                'business_expense'
            ]
        },
        title: String,
        description: String,
        potential_savings: Number,
        deadline: Date,
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium'
        },
        implemented: { type: Boolean, default: false },
        implemented_date: Date
    }],
    generated_files: [{
        file_name: String,
        file_type: String, // PDF, CSV, JSON
        file_url: String,
        file_size: Number,
        generated_at: Date,
        checksum: String
    }],
    review_notes: [{
        reviewer: String,
        date: Date,
        notes: String,
        flagged_items: [String]
    }],
    filing_info: {
        filed_date: Date,
        confirmation_number: String,
        payment_amount: Number,
        payment_method: String,
        payment_confirmation: String,
        extension_filed: Boolean,
        extension_deadline: Date
    },
    amendments: [{
        amended_date: Date,
        reason: String,
        changes: mongoose.Schema.Types.Mixed,
        new_refund_or_owed: Number
    }]
}, {
    timestamps: true
});

// Indexes
taxDocumentSchema.index({ user: 1, tax_year: 1, document_type: 1 });
taxDocumentSchema.index({ status: 1, tax_year: 1 });

// Virtuals
taxDocumentSchema.virtual('total_income').get(function() {
    const data = this.data;
    return (data.wages || 0) + 
           (data.tips || 0) + 
           (data.interest_income || 0) + 
           ((data.dividend_income?.ordinary || 0) + (data.dividend_income?.qualified || 0)) +
           (data.business_income || 0) +
           ((data.capital_gains?.short_term || 0) + (data.capital_gains?.long_term || 0)) +
           (data.rental_income || 0) +
           (data.other_income || 0);
});

taxDocumentSchema.virtual('total_deductions').get(function() {
    const data = this.data;
    if (data.standard_deduction) {
        return data.standard_deduction;
    }
    
    const itemized = Object.values(data.itemized_deductions || {}).reduce((sum, val) => sum + (val || 0), 0);
    const business = Object.values(data.business_expenses || {}).reduce((sum, val) => sum + (val || 0), 0);
    return itemized + business + (data.retirement_contributions || 0);
});

taxDocumentSchema.virtual('is_overdue').get(function() {
    if (this.status === 'filed') return false;
    
    const year = this.tax_year;
    const deadline = new Date(year + 1, 3, 15); // April 15
    return new Date() > deadline;
});

// Methods
taxDocumentSchema.methods.calculateTax = function(taxRules) {
    // Calculate AGI
    this.data.adjusted_gross_income = this.total_income;
    
    // Apply deductions
    this.data.taxable_income = Math.max(0, this.data.adjusted_gross_income - this.total_deductions);
    
    // Calculate tax using rules
    if (taxRules) {
        this.data.total_tax = taxRules.calculateTax(this.data.taxable_income, this.filing_status);
    }
    
    // Apply credits
    const totalCredits = (this.data.child_tax_credit || 0) +
                        (this.data.education_credit || 0) +
                        (this.data.earned_income_credit || 0) +
                        (this.data.foreign_tax_credit || 0);
    
    this.data.credits_applied = totalCredits;
    this.data.total_tax = Math.max(0, this.data.total_tax - totalCredits);
    
    // Calculate refund or owed
    const totalPayments = (this.data.tax_withheld || 0) + (this.data.estimated_payments || 0);
    this.data.refund_or_owed = totalPayments - this.data.total_tax;
    
    return this.save();
};

taxDocumentSchema.methods.addOptimizationSuggestion = function(type, title, description, savings, deadline, priority) {
    this.optimization_suggestions.push({
        suggestion_type: type,
        title,
        description,
        potential_savings: savings,
        deadline,
        priority
    });
    return this.save();
};

taxDocumentSchema.methods.markSuggestionImplemented = function(suggestionId) {
    const suggestion = this.optimization_suggestions.id(suggestionId);
    if (suggestion) {
        suggestion.implemented = true;
        suggestion.implemented_date = new Date();
    }
    return this.save();
};

taxDocumentSchema.methods.addGeneratedFile = function(fileName, fileType, fileUrl, fileSize) {
    this.generated_files.push({
        file_name: fileName,
        file_type: fileType,
        file_url: fileUrl,
        file_size: fileSize,
        generated_at: new Date()
    });
    return this.save();
};

taxDocumentSchema.methods.markFiled = function(confirmationNumber, paymentAmount, paymentMethod) {
    this.status = 'filed';
    this.filing_info = {
        filed_date: new Date(),
        confirmation_number: confirmationNumber,
        payment_amount: paymentAmount,
        payment_method: paymentMethod
    };
    return this.save();
};

// Static methods
taxDocumentSchema.statics.getUserDocuments = function(userId, taxYear = null) {
    const query = { user: userId };
    if (taxYear) {
        query.tax_year = taxYear;
    }
    return this.find(query).sort({ tax_year: -1, createdAt: -1 });
};

taxDocumentSchema.statics.getUnfiledDocuments = function() {
    const currentYear = new Date().getFullYear();
    return this.find({
        tax_year: { $lte: currentYear - 1 },
        status: { $in: ['draft', 'generated', 'reviewed'] }
    }).populate('user', 'name email');
};

taxDocumentSchema.statics.getDocumentsByType = function(userId, documentType, taxYear) {
    return this.findOne({
        user: userId,
        document_type: documentType,
        tax_year: taxYear
    });
};

module.exports = mongoose.model('TaxDocument', taxDocumentSchema);
