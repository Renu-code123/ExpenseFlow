/**
 * Debt Account Model
 * Issue #520: Comprehensive Debt Management & Amortization Engine
 * Tracks long-term liabilities with interest calculations
 */

const mongoose = require('mongoose');

const debtAccountSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    debtType: {
        type: String,
        enum: ['mortgage', 'car_loan', 'personal_loan', 'student_loan', 'credit_card', 'other'],
        required: true
    },
    lender: {
        type: String,
        trim: true
    },

    // Principal & Balance
    originalPrincipal: {
        type: Number,
        required: true,
        min: 0
    },
    currentBalance: {
        type: Number,
        required: true,
        min: 0
    },

    // Interest Configuration
    interestRate: {
        type: Number,
        required: true,
        min: 0,
        max: 100 // Percentage
    },
    interestType: {
        type: String,
        enum: ['fixed', 'variable'],
        default: 'fixed'
    },
    compoundingFrequency: {
        type: String,
        enum: ['daily', 'monthly', 'quarterly', 'annually'],
        default: 'monthly'
    },

    // Payment Terms
    monthlyPayment: {
        type: Number,
        required: true,
        min: 0
    },
    minimumPayment: {
        type: Number,
        min: 0
    },
    termMonths: {
        type: Number,
        required: true,
        min: 1
    },
    remainingMonths: {
        type: Number,
        min: 0
    },

    // Dates
    originationDate: {
        type: Date,
        required: true
    },
    firstPaymentDate: {
        type: Date,
        required: true
    },
    expectedPayoffDate: {
        type: Date
    },
    actualPayoffDate: {
        type: Date
    },

    // Status
    status: {
        type: String,
        enum: ['active', 'paid_off', 'defaulted', 'refinanced'],
        default: 'active'
    },

    // Payment History
    totalPaid: {
        type: Number,
        default: 0
    },
    totalInterestPaid: {
        type: Number,
        default: 0
    },
    totalPrincipalPaid: {
        type: Number,
        default: 0
    },
    paymentsCount: {
        type: Number,
        default: 0
    },
    missedPayments: {
        type: Number,
        default: 0
    },

    // Strategy Settings
    repaymentStrategy: {
        type: String,
        enum: ['standard', 'snowball', 'avalanche', 'custom'],
        default: 'standard'
    },
    extraPayment: {
        type: Number,
        default: 0,
        min: 0
    },

    // Metadata
    currency: {
        type: String,
        default: 'USD'
    },
    accountNumber: {
        type: String,
        trim: true
    },
    notes: {
        type: String
    },
    tags: [{
        type: String,
        trim: true
    }],

    // Flags
    isAutoPayEnabled: {
        type: Boolean,
        default: false
    },
    includeInDebtToIncome: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Indexes
debtAccountSchema.index({ userId: 1, status: 1 });
debtAccountSchema.index({ userId: 1, debtType: 1 });
debtAccountSchema.index({ expectedPayoffDate: 1 });

// Virtual: Total amount to be paid (principal + interest)
debtAccountSchema.virtual('totalAmount').get(function () {
    return this.monthlyPayment * this.termMonths;
});

// Virtual: Total interest over life of loan
debtAccountSchema.virtual('totalInterest').get(function () {
    return (this.monthlyPayment * this.termMonths) - this.originalPrincipal;
});

// Virtual: Progress percentage
debtAccountSchema.virtual('progressPercentage').get(function () {
    if (this.originalPrincipal === 0) return 100;
    const paidOff = this.originalPrincipal - this.currentBalance;
    return (paidOff / this.originalPrincipal) * 100;
});

// Virtual: Debt-to-Income ratio (requires income to be passed)
debtAccountSchema.methods.calculateDebtToIncome = function (monthlyIncome) {
    if (monthlyIncome === 0) return 0;
    return (this.monthlyPayment / monthlyIncome) * 100;
};

// Method: Calculate remaining balance after a payment
debtAccountSchema.methods.applyPayment = function (paymentAmount) {
    const monthlyInterestRate = this.interestRate / 100 / 12;
    const interestCharge = this.currentBalance * monthlyInterestRate;
    const principalPayment = paymentAmount - interestCharge;

    this.currentBalance -= principalPayment;
    this.totalPaid += paymentAmount;
    this.totalInterestPaid += interestCharge;
    this.totalPrincipalPaid += principalPayment;
    this.paymentsCount += 1;

    if (this.currentBalance <= 0) {
        this.currentBalance = 0;
        this.status = 'paid_off';
        this.actualPayoffDate = new Date();
    }

    return {
        paymentAmount,
        interestCharge,
        principalPayment,
        newBalance: this.currentBalance
    };
};

// Method: Calculate payoff date with extra payments
debtAccountSchema.methods.calculatePayoffDate = function (extraMonthlyPayment = 0) {
    let balance = this.currentBalance;
    const monthlyRate = this.interestRate / 100 / 12;
    const payment = this.monthlyPayment + extraMonthlyPayment;
    let months = 0;

    while (balance > 0 && months < 600) { // Max 50 years
        const interest = balance * monthlyRate;
        const principal = payment - interest;
        balance -= principal;
        months++;
    }

    const payoffDate = new Date(this.firstPaymentDate);
    payoffDate.setMonth(payoffDate.getMonth() + months);

    return {
        months,
        payoffDate,
        totalInterest: (payment * months) - this.currentBalance
    };
};

// Method: Get summary
debtAccountSchema.methods.getSummary = function () {
    return {
        id: this._id,
        name: this.name,
        debtType: this.debtType,
        currentBalance: this.currentBalance,
        monthlyPayment: this.monthlyPayment,
        interestRate: this.interestRate,
        progressPercentage: this.progressPercentage,
        status: this.status,
        remainingMonths: this.remainingMonths
    };
};

// Static method: Get total debt for user
debtAccountSchema.statics.getTotalDebt = async function (userId, activeOnly = true) {
    const query = { userId };
    if (activeOnly) {
        query.status = 'active';
    }

    const debts = await this.find(query);

    return {
        totalBalance: debts.reduce((sum, d) => sum + d.currentBalance, 0),
        totalMonthlyPayment: debts.reduce((sum, d) => sum + d.monthlyPayment, 0),
        count: debts.length,
        debts: debts.map(d => d.getSummary())
    };
};

// Static method: Get debt by strategy priority (for snowball/avalanche)
debtAccountSchema.statics.getDebtsByStrategy = async function (userId, strategy = 'avalanche') {
    const debts = await this.find({ userId, status: 'active' });

    if (strategy === 'snowball') {
        // Sort by balance (smallest first)
        return debts.sort((a, b) => a.currentBalance - b.currentBalance);
    } else if (strategy === 'avalanche') {
        // Sort by interest rate (highest first)
        return debts.sort((a, b) => b.interestRate - a.interestRate);
    }

    return debts;
};

module.exports = mongoose.model('DebtAccount', debtAccountSchema);
