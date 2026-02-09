const mongoose = require('mongoose');

const currencyRateSchema = new mongoose.Schema({
    baseCurrency: {
        type: String,
        required: true,
        default: 'USD',
        uppercase: true
    },
    rates: {
        type: Map,
        of: Number,
        required: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
        required: true
    },
    source: {
        type: String,
        default: 'exchangerate-api.com'
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    }
}, {
    timestamps: true
});

// Index for efficient queries
currencyRateSchema.index({ baseCurrency: 1, lastUpdated: -1 });

// Method to check if rates are expired
currencyRateSchema.methods.isExpired = function() {
    return new Date() > this.expiresAt;
};

// Method to get rate for specific currency
currencyRateSchema.methods.getRate = function(currency) {
    return this.rates.get(currency.toUpperCase());
};

// Static method to get latest rates
currencyRateSchema.statics.getLatestRates = async function(baseCurrency = 'USD') {
    return await this.findOne({ 
        baseCurrency: baseCurrency.toUpperCase(),
        expiresAt: { $gt: new Date() }
    }).sort({ lastUpdated: -1 });
};

module.exports = mongoose.model('CurrencyRate', currencyRateSchema);
