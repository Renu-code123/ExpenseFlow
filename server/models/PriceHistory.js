const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema({
    symbol: {
        type: String,
        required: true,
        uppercase: true,
        index: true
    },
    asset_type: {
        type: String,
        enum: ['stock', 'crypto', 'etf', 'mutual_fund', 'bond'],
        required: true,
        index: true
    },
    currency: {
        type: String,
        default: 'USD',
        uppercase: true
    },
    exchange: String,
    prices: [{
        date: {
            type: Date,
            required: true
        },
        open: Number,
        high: Number,
        low: Number,
        close: {
            type: Number,
            required: true
        },
        volume: Number,
        adjusted_close: Number
    }],
    latest_price: {
        price: Number,
        change: Number,
        change_percentage: Number,
        timestamp: Date
    },
    metadata: {
        name: String,
        description: String,
        sector: String,
        industry: String,
        market_cap: String,
        pe_ratio: Number,
        eps: Number,
        beta: Number,
        dividend_yield: Number,
        '52_week_high': Number,
        '52_week_low': Number,
        avg_volume: Number,
        website: String,
        country: String
    },
    data_source: {
        provider: {
            type: String,
            enum: ['coingecko', 'alpha_vantage', 'yahoo_finance', 'finnhub', 'polygon', 'manual']
        },
        last_updated: Date,
        update_frequency: {
            type: String,
            enum: ['realtime', '1min', '5min', '15min', '1hour', 'daily'],
            default: 'daily'
        },
        api_calls_today: {
            type: Number,
            default: 0
        },
        rate_limit: Number
    },
    cache_info: {
        last_accessed: Date,
        access_count: {
            type: Number,
            default: 0
        },
        is_stale: {
            type: Boolean,
            default: false
        },
        ttl: {
            type: Number,
            default: 3600 // seconds
        }
    }
}, {
    timestamps: true
});

// Indexes
priceHistorySchema.index({ symbol: 1, asset_type: 1 }, { unique: true });
priceHistorySchema.index({ 'data_source.last_updated': 1 });
priceHistorySchema.index({ 'cache_info.is_stale': 1 });

// Virtuals
priceHistorySchema.virtual('days_of_data').get(function() {
    return this.prices.length;
});

priceHistorySchema.virtual('needs_update').get(function() {
    if (!this.data_source.last_updated) return true;
    
    const now = new Date();
    const lastUpdate = this.data_source.last_updated;
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
    
    // Update based on frequency
    switch (this.data_source.update_frequency) {
        case 'realtime':
        case '1min':
            return hoursSinceUpdate > 0.017; // 1 minute
        case '5min':
            return hoursSinceUpdate > 0.083; // 5 minutes
        case '15min':
            return hoursSinceUpdate > 0.25; // 15 minutes
        case '1hour':
            return hoursSinceUpdate > 1;
        case 'daily':
        default:
            return hoursSinceUpdate > 24;
    }
});

// Methods
priceHistorySchema.methods.addPrice = function(priceData) {
    // Check if price for this date already exists
    const existingIndex = this.prices.findIndex(p => 
        p.date.toDateString() === priceData.date.toDateString()
    );
    
    if (existingIndex >= 0) {
        // Update existing price
        this.prices[existingIndex] = priceData;
    } else {
        // Add new price
        this.prices.push(priceData);
    }
    
    // Sort by date (newest last)
    this.prices.sort((a, b) => a.date - b.date);
    
    // Keep only last 365 days
    if (this.prices.length > 365) {
        this.prices = this.prices.slice(-365);
    }
    
    // Update latest price
    if (priceData.close) {
        const previousClose = this.prices.length > 1 
            ? this.prices[this.prices.length - 2].close 
            : priceData.close;
        
        this.latest_price = {
            price: priceData.close,
            change: priceData.close - previousClose,
            change_percentage: ((priceData.close - previousClose) / previousClose) * 100,
            timestamp: new Date()
        };
    }
    
    // Update data source info
    this.data_source.last_updated = new Date();
    this.cache_info.is_stale = false;
    this.cache_info.last_accessed = new Date();
    
    return this.save();
};

priceHistorySchema.methods.updateLatestPrice = function(price, provider) {
    const previousPrice = this.latest_price.price || price;
    
    this.latest_price = {
        price,
        change: price - previousPrice,
        change_percentage: ((price - previousPrice) / previousPrice) * 100,
        timestamp: new Date()
    };
    
    this.data_source.provider = provider;
    this.data_source.last_updated = new Date();
    this.data_source.api_calls_today += 1;
    this.cache_info.is_stale = false;
    this.cache_info.last_accessed = new Date();
    this.cache_info.access_count += 1;
    
    return this.save();
};

priceHistorySchema.methods.getHistoricalData = function(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return this.prices.filter(p => p.date >= cutoffDate);
};

priceHistorySchema.methods.calculateVolatility = function(days = 30) {
    const historicalData = this.getHistoricalData(days);
    
    if (historicalData.length < 2) return 0;
    
    // Calculate daily returns
    const returns = [];
    for (let i = 1; i < historicalData.length; i++) {
        const dailyReturn = (historicalData[i].close - historicalData[i - 1].close) / 
                           historicalData[i - 1].close;
        returns.push(dailyReturn);
    }
    
    // Calculate standard deviation of returns
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized
    
    return volatility * 100; // Return as percentage
};

priceHistorySchema.methods.markStale = function() {
    this.cache_info.is_stale = true;
    return this.save();
};

// Static methods
priceHistorySchema.statics.getPrice = async function(symbol, assetType) {
    const priceHistory = await this.findOne({ symbol, asset_type: assetType });
    
    if (!priceHistory || priceHistory.needs_update) {
        return null; // Trigger price update
    }
    
    // Update access info
    priceHistory.cache_info.last_accessed = new Date();
    priceHistory.cache_info.access_count += 1;
    await priceHistory.save();
    
    return priceHistory.latest_price.price;
};

priceHistorySchema.statics.getStaleRecords = function(maxAge = 24) {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - maxAge);
    
    return this.find({
        $or: [
            { 'data_source.last_updated': { $lt: cutoffDate } },
            { 'cache_info.is_stale': true }
        ]
    });
};

priceHistorySchema.statics.bulkUpdatePrices = async function(priceUpdates) {
    const operations = priceUpdates.map(update => ({
        updateOne: {
            filter: { symbol: update.symbol, asset_type: update.asset_type },
            update: {
                $set: {
                    'latest_price': {
                        price: update.price,
                        change: update.change || 0,
                        change_percentage: update.change_percentage || 0,
                        timestamp: new Date()
                    },
                    'data_source.last_updated': new Date(),
                    'data_source.provider': update.provider,
                    'cache_info.is_stale': false
                }
            },
            upsert: true
        }
    }));
    
    return this.bulkWrite(operations);
};

priceHistorySchema.statics.cleanupOldCache = async function(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await this.deleteMany({
        'cache_info.last_accessed': { $lt: cutoffDate },
        'cache_info.access_count': { $lt: 5 }
    });
    
    return result;
};

module.exports = mongoose.model('PriceHistory', priceHistorySchema);
