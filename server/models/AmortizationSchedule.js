/**
 * Amortization Schedule Model
 * Issue #520: Comprehensive Debt Management & Amortization Engine
 * Stores pre-calculated payment schedules for debts
 */

const mongoose = require('mongoose');

const paymentEntrySchema = new mongoose.Schema({
    paymentNumber: {
        type: Number,
        required: true
    },
    paymentDate: {
        type: Date,
        required: true
    },
    beginningBalance: {
        type: Number,
        required: true
    },
    scheduledPayment: {
        type: Number,
        required: true
    },
    extraPayment: {
        type: Number,
        default: 0
    },
    totalPayment: {
        type: Number,
        required: true
    },
    principalPayment: {
        type: Number,
        required: true
    },
    interestPayment: {
        type: Number,
        required: true
    },
    endingBalance: {
        type: Number,
        required: true
    },
    cumulativeInterest: {
        type: Number,
        required: true
    },
    cumulativePrincipal: {
        type: Number,
        required: true
    }
}, { _id: false });

const amortizationScheduleSchema = new mongoose.Schema({
    debtAccountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DebtAccount',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Schedule Configuration
    scheduleType: {
        type: String,
        enum: ['standard', 'with_extra', 'snowball', 'avalanche', 'custom'],
        default: 'standard'
    },

    // Financial Summary
    principal: {
        type: Number,
        required: true
    },
    interestRate: {
        type: Number,
        required: true
    },
    termMonths: {
        type: Number,
        required: true
    },
    monthlyPayment: {
        type: Number,
        required: true
    },
    extraMonthlyPayment: {
        type: Number,
        default: 0
    },

    // Calculated Totals
    totalPayments: {
        type: Number,
        required: true
    },
    totalInterest: {
        type: Number,
        required: true
    },
    totalPrincipal: {
        type: Number,
        required: true
    },
    actualTermMonths: {
        type: Number // Actual months with extra payments
    },

    // Savings (if extra payments)
    interestSaved: {
        type: Number,
        default: 0
    },
    monthsSaved: {
        type: Number,
        default: 0
    },

    // Payment Schedule
    payments: [paymentEntrySchema],

    // Metadata
    generatedAt: {
        type: Date,
        default: Date.now
    },
    validUntil: {
        type: Date
    },
    notes: {
        type: String
    }
}, {
    timestamps: true
});

// Indexes
amortizationScheduleSchema.index({ debtAccountId: 1, scheduleType: 1 });
amortizationScheduleSchema.index({ userId: 1, generatedAt: -1 });

// Virtual: Payment count
amortizationScheduleSchema.virtual('paymentCount').get(function () {
    return this.payments.length;
});

// Virtual: Monthly interest rate
amortizationScheduleSchema.virtual('monthlyInterestRate').get(function () {
    return this.interestRate / 100 / 12;
});

// Method: Get payment at specific month
amortizationScheduleSchema.methods.getPaymentAtMonth = function (monthNumber) {
    return this.payments.find(p => p.paymentNumber === monthNumber);
};

// Method: Get payments in date range
amortizationScheduleSchema.methods.getPaymentsInRange = function (startDate, endDate) {
    return this.payments.filter(p =>
        p.paymentDate >= startDate && p.paymentDate <= endDate
    );
};

// Method: Get summary statistics
amortizationScheduleSchema.methods.getSummary = function () {
    return {
        scheduleType: this.scheduleType,
        principal: this.principal,
        interestRate: this.interestRate,
        monthlyPayment: this.monthlyPayment,
        extraMonthlyPayment: this.extraMonthlyPayment,
        termMonths: this.termMonths,
        actualTermMonths: this.actualTermMonths || this.paymentCount,
        totalInterest: this.totalInterest,
        totalPayments: this.totalPayments,
        interestSaved: this.interestSaved,
        monthsSaved: this.monthsSaved,
        paymentCount: this.paymentCount,
        firstPaymentDate: this.payments[0]?.paymentDate,
        lastPaymentDate: this.payments[this.payments.length - 1]?.paymentDate
    };
};

// Method: Compare with another schedule
amortizationScheduleSchema.methods.compareWith = function (otherSchedule) {
    const interestDiff = this.totalInterest - otherSchedule.totalInterest;
    const monthsDiff = this.paymentCount - otherSchedule.paymentCount;
    const paymentDiff = this.totalPayments - otherSchedule.totalPayments;

    return {
        interestDifference: interestDiff,
        monthsDifference: monthsDiff,
        totalPaymentDifference: paymentDiff,
        percentageSaved: otherSchedule.totalInterest > 0 ?
            (interestDiff / otherSchedule.totalInterest) * 100 : 0,
        recommendation: interestDiff < 0 ?
            'This schedule saves money' :
            'Other schedule is more cost-effective'
    };
};

// Method: Get milestone payments (every 12 months)
amortizationScheduleSchema.methods.getMilestones = function () {
    const milestones = [];

    for (let i = 11; i < this.payments.length; i += 12) {
        const payment = this.payments[i];
        milestones.push({
            year: Math.floor(i / 12) + 1,
            paymentNumber: payment.paymentNumber,
            date: payment.paymentDate,
            balance: payment.endingBalance,
            cumulativeInterest: payment.cumulativeInterest,
            cumulativePrincipal: payment.cumulativePrincipal
        });
    }

    // Add final payment
    const lastPayment = this.payments[this.payments.length - 1];
    if (!milestones.find(m => m.paymentNumber === lastPayment.paymentNumber)) {
        milestones.push({
            year: Math.ceil(this.payments.length / 12),
            paymentNumber: lastPayment.paymentNumber,
            date: lastPayment.paymentDate,
            balance: lastPayment.endingBalance,
            cumulativeInterest: lastPayment.cumulativeInterest,
            cumulativePrincipal: lastPayment.cumulativePrincipal
        });
    }

    return milestones;
};

// Static method: Generate standard amortization schedule
amortizationScheduleSchema.statics.generateSchedule = async function (debtAccount, extraPayment = 0, scheduleType = 'standard') {
    const payments = [];
    let balance = debtAccount.currentBalance || debtAccount.originalPrincipal;
    const monthlyRate = debtAccount.interestRate / 100 / 12;
    const regularPayment = debtAccount.monthlyPayment;
    const totalPayment = regularPayment + extraPayment;

    let cumulativeInterest = 0;
    let cumulativePrincipal = 0;
    let paymentNumber = 1;
    let paymentDate = new Date(debtAccount.firstPaymentDate || new Date());

    while (balance > 0.01 && paymentNumber <= 600) { // Max 50 years
        const interestPayment = balance * monthlyRate;
        const principalPayment = Math.min(totalPayment - interestPayment, balance);
        const actualPayment = interestPayment + principalPayment;

        cumulativeInterest += interestPayment;
        cumulativePrincipal += principalPayment;

        payments.push({
            paymentNumber,
            paymentDate: new Date(paymentDate),
            beginningBalance: balance,
            scheduledPayment: regularPayment,
            extraPayment: extraPayment,
            totalPayment: actualPayment,
            principalPayment,
            interestPayment,
            endingBalance: balance - principalPayment,
            cumulativeInterest,
            cumulativePrincipal
        });

        balance -= principalPayment;
        paymentNumber++;
        paymentDate.setMonth(paymentDate.getMonth() + 1);
    }

    return {
        debtAccountId: debtAccount._id,
        userId: debtAccount.userId,
        scheduleType,
        principal: debtAccount.originalPrincipal,
        interestRate: debtAccount.interestRate,
        termMonths: debtAccount.termMonths,
        monthlyPayment: regularPayment,
        extraMonthlyPayment: extraPayment,
        totalPayments: cumulativeInterest + cumulativePrincipal,
        totalInterest: cumulativeInterest,
        totalPrincipal: cumulativePrincipal,
        actualTermMonths: payments.length,
        payments
    };
};

module.exports = mongoose.model('AmortizationSchedule', amortizationScheduleSchema);
