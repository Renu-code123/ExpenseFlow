const mongoose = require('mongoose');

/**
 * UnrealizedGainLoss Model
 * Stores unrealized FX positions for foreign currency assets and liabilities
 */
const unrealizedGainLossSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'accountType',
        required: true
    },
    accountType: {
        type: String,
        enum: ['Account', 'DebtAccount', 'TreasuryVault', 'Transaction'],
        required: true
    },
    accountName: String,
    currency: {
        type: String,
        required: true
    },
    baseCurrency: {
        type: String,
        default: 'INR'
    },
    originalAmount: {
        type: Number,
        required: true
    },
    originalRate: {
        type: Number,
        required: true
    },
    currentRate: {
        type: Number,
        required: true
    },
    baseAmountOriginal: {
        type: Number,
        required: true
    },
    baseAmountCurrent: {
        type: Number,
        required: true
    },
    unrealizedGainLoss: {
        type: Number,
        required: true
    },
    gainLossType: {
        type: String,
        enum: ['gain', 'loss', 'neutral'],
        required: true
    },
    gainLossPercentage: {
        type: Number,
        default: 0
    },
    asOfDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    lastRevaluationDate: Date,
    isRealized: {
        type: Boolean,
        default: false
    },
    realizedDate: Date,
    realizedAmount: Number,
    rateHistory: [{
        rate: Number,
        date: Date,
        source: String
    }],
    status: {
        type: String,
        enum: ['active', 'realized', 'closed'],
        default: 'active'
    }
}, {
    timestamps: true
});

// Pre-save hook to calculate gain/loss
unrealizedGainLossSchema.pre('save', function (next) {
    // Calculate base amounts
    this.baseAmountOriginal = this.originalAmount * this.originalRate;
    this.baseAmountCurrent = this.originalAmount * this.currentRate;

    // Calculate unrealized gain/loss
    this.unrealizedGainLoss = this.baseAmountCurrent - this.baseAmountOriginal;

    // Determine gain/loss type
    if (this.unrealizedGainLoss > 0) {
        this.gainLossType = 'gain';
    } else if (this.unrealizedGainLoss < 0) {
        this.gainLossType = 'loss';
    } else {
        this.gainLossType = 'neutral';
    }

    // Calculate percentage
    if (this.baseAmountOriginal !== 0) {
        this.gainLossPercentage = (this.unrealizedGainLoss / this.baseAmountOriginal) * 100;
    }

    next();
});

// Indexes
unrealizedGainLossSchema.index({ userId: 1, currency: 1, status: 1 });
unrealizedGainLossSchema.index({ accountId: 1, accountType: 1 });
unrealizedGainLossSchema.index({ asOfDate: -1 });

module.exports = mongoose.model('UnrealizedGainLoss', unrealizedGainLossSchema);
