const mongoose = require('mongoose');

/**
 * ExchangeHedge Model
 * Manages FX risk through hedging strategies for multi-currency operations
 */
const exchangeHedgeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    hedgeId: {
        type: String,
        unique: true,
        required: true
    },
    baseCurrency: {
        type: String,
        required: true,
        uppercase: true
    },
    targetCurrency: {
        type: String,
        required: true,
        uppercase: true
    },
    hedgeType: {
        type: String,
        enum: ['forward_contract', 'option', 'swap', 'natural_hedge'],
        required: true
    },
    notionalAmount: {
        type: Number,
        required: true
    },
    contractRate: {
        type: Number,
        required: true
    },
    marketRate: {
        type: Number,
        default: null
    },
    maturityDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'settled', 'expired', 'cancelled'],
        default: 'active'
    },
    effectiveness: {
        hedgeRatio: { type: Number, default: 1.0 },
        gainLoss: { type: Number, default: 0 },
        mtmValue: { type: Number, default: 0 } // Mark-to-Market
    },
    counterparty: {
        name: String,
        rating: String
    },
    linkedTransactions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction'
    }],
    notes: String
}, {
    timestamps: true
});

// Calculate MTM value before saving
exchangeHedgeSchema.pre('save', function (next) {
    if (this.marketRate && this.contractRate) {
        const rateDiff = this.marketRate - this.contractRate;
        this.effectiveness.mtmValue = rateDiff * this.notionalAmount;
        this.effectiveness.gainLoss = this.effectiveness.mtmValue;
    }
    next();
});

// Indexes
exchangeHedgeSchema.index({ userId: 1, status: 1 });
exchangeHedgeSchema.index({ maturityDate: 1, status: 1 });
exchangeHedgeSchema.index({ baseCurrency: 1, targetCurrency: 1 });

module.exports = mongoose.model('ExchangeHedge', exchangeHedgeSchema);
