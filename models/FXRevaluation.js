const mongoose = require('mongoose');

/**
 * FXRevaluation Model
 * Tracks foreign exchange revaluation history for compliance and audit
 */
const revaluationItemSchema = new mongoose.Schema({
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'accountType'
    },
    accountType: {
        type: String,
        enum: ['Account', 'DebtAccount', 'TreasuryVault']
    },
    accountName: String,
    currency: {
        type: String,
        required: true
    },
    originalAmount: {
        type: Number,
        required: true
    },
    originalRate: {
        type: Number,
        required: true
    },
    newRate: {
        type: Number,
        required: true
    },
    baseAmount: {
        type: Number,
        required: true
    },
    revaluedAmount: {
        type: Number,
        required: true
    },
    gainLoss: {
        type: Number,
        required: true
    },
    gainLossType: {
        type: String,
        enum: ['gain', 'loss'],
        required: true
    }
}, { _id: false });

const fxRevaluationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    revaluationId: {
        type: String,
        unique: true,
        required: true
    },
    revaluationDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    baseCurrency: {
        type: String,
        required: true,
        default: 'INR'
    },
    revaluationType: {
        type: String,
        enum: ['manual', 'automated', 'scheduled'],
        default: 'automated'
    },
    items: [revaluationItemSchema],
    summary: {
        totalAccounts: {
            type: Number,
            default: 0
        },
        totalGain: {
            type: Number,
            default: 0
        },
        totalLoss: {
            type: Number,
            default: 0
        },
        netGainLoss: {
            type: Number,
            default: 0
        },
        currenciesRevalued: [String]
    },
    exchangeRates: [{
        currency: String,
        rate: Number,
        source: String,
        timestamp: Date
    }],
    journalEntryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction'
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'reversed'],
        default: 'pending'
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    notes: String
}, {
    timestamps: true
});

// Pre-save hook to calculate summary
fxRevaluationSchema.pre('save', function (next) {
    this.summary.totalAccounts = this.items.length;
    this.summary.totalGain = this.items
        .filter(i => i.gainLossType === 'gain')
        .reduce((sum, i) => sum + Math.abs(i.gainLoss), 0);
    this.summary.totalLoss = this.items
        .filter(i => i.gainLossType === 'loss')
        .reduce((sum, i) => sum + Math.abs(i.gainLoss), 0);
    this.summary.netGainLoss = this.summary.totalGain - this.summary.totalLoss;
    this.summary.currenciesRevalued = [...new Set(this.items.map(i => i.currency))];

    next();
});

// Indexes
fxRevaluationSchema.index({ userId: 1, revaluationDate: -1 });
fxRevaluationSchema.index({ status: 1, revaluationType: 1 });

module.exports = mongoose.model('FXRevaluation', fxRevaluationSchema);
