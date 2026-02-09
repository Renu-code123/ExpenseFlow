const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
    portfolio: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Portfolio',
        required: true,
        index: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    asset_type: {
        type: String,
        enum: ['stock', 'crypto', 'etf', 'mutual_fund', 'bond', 'cash'],
        required: true
    },
    symbol: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    name: {
        type: String,
        required: true
    },
    exchange: String,
    currency: {
        type: String,
        default: 'USD',
        uppercase: true
    },
    quantity: {
        type: Number,
        required: true,
        default: 0
    },
    average_buy_price: {
        type: Number,
        required: true,
        default: 0
    },
    current_price: {
        type: Number,
        default: 0
    },
    current_value: {
        type: Number,
        default: 0
    },
    total_invested: {
        type: Number,
        default: 0
    },
    unrealized_gain: {
        type: Number,
        default: 0
    },
    unrealized_gain_percentage: {
        type: Number,
        default: 0
    },
    realized_gain: {
        type: Number,
        default: 0
    },
    total_gain: {
        type: Number,
        default: 0
    },
    tax_lots: [{
        purchase_date: Date,
        quantity: Number,
        price: Number,
        cost_basis: Number,
        remaining_quantity: Number,
        transaction_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Transaction'
        }
    }],
    dividend_info: {
        dividend_yield: Number,
        annual_dividend: Number,
        total_dividends_received: {
            type: Number,
            default: 0
        },
        next_dividend_date: Date,
        dividend_frequency: {
            type: String,
            enum: ['monthly', 'quarterly', 'semi-annual', 'annual', 'none'],
            default: 'none'
        }
    },
    price_alerts: [{
        alert_type: {
            type: String,
            enum: ['above', 'below', 'change_percentage']
        },
        target_price: Number,
        percentage_change: Number,
        is_active: {
            type: Boolean,
            default: true
        },
        triggered: {
            type: Boolean,
            default: false
        },
        triggered_at: Date,
        notification_sent: {
            type: Boolean,
            default: false
        }
    }],
    metadata: {
        sector: String,
        industry: String,
        market_cap: String,
        pe_ratio: Number,
        beta: Number,
        52_week_high: Number,
        52_week_low: Number,
        volume: Number,
        avg_volume: Number
    },
    watchlist: {
        type: Boolean,
        default: false
    },
    notes: String,
    tags: [String],
    last_price_update: Date,
    price_update_status: {
        type: String,
        enum: ['success', 'failed', 'pending'],
        default: 'pending'
    },
    price_update_error: String
}, {
    timestamps: true
});

// Indexes
assetSchema.index({ portfolio: 1, asset_type: 1 });
assetSchema.index({ user: 1, watchlist: 1 });
assetSchema.index({ symbol: 1, asset_type: 1 });

// Virtuals
assetSchema.virtual('portfolio_percentage').get(function() {
    // This will be calculated from portfolio total value
    return 0;
});

assetSchema.virtual('days_held').get(function() {
    if (this.tax_lots.length === 0) return 0;
    const oldestLot = this.tax_lots.reduce((oldest, lot) => 
        lot.purchase_date < oldest.purchase_date ? lot : oldest
    );
    const daysDiff = (new Date() - oldestLot.purchase_date) / (1000 * 60 * 60 * 24);
    return Math.floor(daysDiff);
});

assetSchema.virtual('is_long_term').get(function() {
    return this.days_held > 365; // Long-term if held > 1 year
});

// Methods
assetSchema.methods.updateCurrentPrice = function(price) {
    this.current_price = price;
    this.current_value = this.quantity * price;
    this.unrealized_gain = this.current_value - this.total_invested;
    this.unrealized_gain_percentage = this.total_invested > 0 
        ? (this.unrealized_gain / this.total_invested) * 100 
        : 0;
    this.total_gain = this.realized_gain + this.unrealized_gain;
    this.last_price_update = new Date();
    this.price_update_status = 'success';
    
    return this.save();
};

assetSchema.methods.addTransaction = function(quantity, price, transactionId) {
    // Add new tax lot
    this.tax_lots.push({
        purchase_date: new Date(),
        quantity,
        price,
        cost_basis: quantity * price,
        remaining_quantity: quantity,
        transaction_id: transactionId
    });
    
    // Update totals
    this.quantity += quantity;
    this.total_invested += quantity * price;
    
    // Recalculate average buy price
    this.average_buy_price = this.total_invested / this.quantity;
    
    return this.save();
};

assetSchema.methods.sellShares = function(quantity, price, method = 'FIFO') {
    let remainingToSell = quantity;
    let realizedGain = 0;
    
    // Sort tax lots based on method
    const lots = method === 'FIFO' 
        ? this.tax_lots.sort((a, b) => a.purchase_date - b.purchase_date)
        : this.tax_lots.sort((a, b) => b.purchase_date - a.purchase_date);
    
    for (const lot of lots) {
        if (remainingToSell <= 0) break;
        if (lot.remaining_quantity <= 0) continue;
        
        const quantityToSell = Math.min(lot.remaining_quantity, remainingToSell);
        const costBasis = quantityToSell * lot.price;
        const proceeds = quantityToSell * price;
        
        realizedGain += proceeds - costBasis;
        lot.remaining_quantity -= quantityToSell;
        remainingToSell -= quantityToSell;
    }
    
    this.quantity -= quantity;
    this.realized_gain += realizedGain;
    this.current_value = this.quantity * price;
    this.unrealized_gain = this.current_value - this.total_invested;
    this.total_gain = this.realized_gain + this.unrealized_gain;
    
    // Remove empty tax lots
    this.tax_lots = this.tax_lots.filter(lot => lot.remaining_quantity > 0);
    
    return this.save();
};

assetSchema.methods.checkPriceAlerts = async function() {
    const triggeredAlerts = [];
    
    for (const alert of this.price_alerts) {
        if (!alert.is_active || alert.triggered) continue;
        
        let shouldTrigger = false;
        
        switch (alert.alert_type) {
            case 'above':
                shouldTrigger = this.current_price >= alert.target_price;
                break;
            case 'below':
                shouldTrigger = this.current_price <= alert.target_price;
                break;
            case 'change_percentage':
                const change = ((this.current_price - this.average_buy_price) / this.average_buy_price) * 100;
                shouldTrigger = Math.abs(change) >= alert.percentage_change;
                break;
        }
        
        if (shouldTrigger) {
            alert.triggered = true;
            alert.triggered_at = new Date();
            triggeredAlerts.push(alert);
        }
    }
    
    if (triggeredAlerts.length > 0) {
        await this.save();
    }
    
    return triggeredAlerts;
};

assetSchema.methods.addDividend = function(amount) {
    this.dividend_info.total_dividends_received += amount;
    return this.save();
};

// Static methods
assetSchema.statics.getPortfolioAssets = function(portfolioId) {
    return this.find({ portfolio: portfolioId })
        .sort({ current_value: -1 });
};

assetSchema.statics.getUserAssets = function(userId, filters = {}) {
    const query = { user: userId };
    
    if (filters.asset_type) {
        query.asset_type = filters.asset_type;
    }
    
    if (filters.watchlist) {
        query.watchlist = true;
    }
    
    return this.find(query).populate('portfolio');
};

assetSchema.statics.getTopPerformers = function(portfolioId, limit = 5) {
    return this.find({ portfolio: portfolioId })
        .sort({ unrealized_gain_percentage: -1 })
        .limit(limit);
};

assetSchema.statics.getWorstPerformers = function(portfolioId, limit = 5) {
    return this.find({ portfolio: portfolioId })
        .sort({ unrealized_gain_percentage: 1 })
        .limit(limit);
};

module.exports = mongoose.model('Asset', assetSchema);
