const mongoose = require('mongoose');

const investmentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['crypto', 'stock', 'fund', 'gold', 'other'],
        required: true,
        default: 'crypto'
    },
    symbol: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 0
    },
    buyPrice: {
        type: Number,
        required: true,
        min: 0
    },
    currentPrice: {
        type: Number,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    notes: {
        type: String,
        trim: true,
        maxlength: 500
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Calculate current value
investmentSchema.virtual('currentValue').get(function () {
    return this.quantity * (this.currentPrice || this.buyPrice);
});

// Calculate total cost
investmentSchema.virtual('totalCost').get(function () {
    return this.quantity * this.buyPrice;
});

// Calculate profit/loss
investmentSchema.virtual('profitLoss').get(function () {
    return this.currentValue - this.totalCost;
});

// Calculate profit/loss percentage
investmentSchema.virtual('profitLossPercent').get(function () {
    if (this.totalCost === 0) return 0;
    return ((this.currentValue - this.totalCost) / this.totalCost) * 100;
});

module.exports = mongoose.model('Investment', investmentSchema);
