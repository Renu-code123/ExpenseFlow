const mongoose = require('mongoose');

const portfolioSchema = new mongoose.Schema({
    user: {
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
    description: String,
    base_currency: {
        type: String,
        required: true,
        default: 'USD',
        uppercase: true
    },
    total_value: {
        type: Number,
        default: 0
    },
    total_invested: {
        type: Number,
        default: 0
    },
    total_return: {
        type: Number,
        default: 0
    },
    total_return_percentage: {
        type: Number,
        default: 0
    },
    asset_allocation: {
        stocks: {
            value: { type: Number, default: 0 },
            percentage: { type: Number, default: 0 }
        },
        crypto: {
            value: { type: Number, default: 0 },
            percentage: { type: Number, default: 0 }
        },
        etfs: {
            value: { type: Number, default: 0 },
            percentage: { type: Number, default: 0 }
        },
        mutual_funds: {
            value: { type: Number, default: 0 },
            percentage: { type: Number, default: 0 }
        },
        bonds: {
            value: { type: Number, default: 0 },
            percentage: { type: Number, default: 0 }
        },
        cash: {
            value: { type: Number, default: 0 },
            percentage: { type: Number, default: 0 }
        }
    },
    performance_metrics: {
        roi: Number, // Return on Investment
        cagr: Number, // Compound Annual Growth Rate
        sharpe_ratio: Number,
        volatility: Number,
        beta: Number,
        alpha: Number,
        max_drawdown: Number,
        ytd_return: Number,
        one_year_return: Number,
        three_year_return: Number,
        five_year_return: Number
    },
    benchmarks: [{
        index: {
            type: String,
            enum: ['S&P500', 'NASDAQ', 'NIFTY50', 'SENSEX', 'FTSE100', 'DAX', 'BITCOIN', 'GOLD']
        },
        correlation: Number,
        relative_performance: Number
    }],
    risk_metrics: {
        risk_score: {
            type: Number,
            min: 0,
            max: 100
        },
        diversification_score: {
            type: Number,
            min: 0,
            max: 100
        },
        concentration_risk: {
            top_holding_percentage: Number,
            top_5_percentage: Number,
            top_10_percentage: Number
        }
    },
    rebalancing: {
        target_allocation: {
            stocks: Number,
            crypto: Number,
            etfs: Number,
            mutual_funds: Number,
            bonds: Number,
            cash: Number
        },
        last_rebalanced: Date,
        rebalancing_threshold: {
            type: Number,
            default: 5 // percentage
        },
        needs_rebalancing: {
            type: Boolean,
            default: false
        },
        recommendations: [{
            asset_type: String,
            action: {
                type: String,
                enum: ['buy', 'sell', 'hold']
            },
            amount: Number,
            percentage: Number,
            reason: String
        }]
    },
    historical_values: [{
        date: Date,
        total_value: Number,
        total_invested: Number,
        total_return: Number,
        return_percentage: Number
    }],
    dividend_income: {
        total: {
            type: Number,
            default: 0
        },
        ytd: {
            type: Number,
            default: 0
        },
        last_12_months: {
            type: Number,
            default: 0
        }
    },
    is_active: {
        type: Boolean,
        default: true
    },
    visibility: {
        type: String,
        enum: ['private', 'public', 'shared'],
        default: 'private'
    },
    shared_with: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        permission: {
            type: String,
            enum: ['view', 'edit'],
            default: 'view'
        }
    }]
}, {
    timestamps: true
});

// Indexes
portfolioSchema.index({ user: 1, is_active: 1 });
portfolioSchema.index({ user: 1, createdAt: -1 });

// Virtuals
portfolioSchema.virtual('unrealized_gains').get(function() {
    return this.total_value - this.total_invested;
});

portfolioSchema.virtual('asset_count').get(function() {
    // This will be calculated dynamically from Asset model
    return 0;
});

// Methods
portfolioSchema.methods.updateTotalValue = function(newValue) {
    this.total_value = newValue;
    this.total_return = newValue - this.total_invested;
    this.total_return_percentage = this.total_invested > 0 
        ? (this.total_return / this.total_invested) * 100 
        : 0;
};

portfolioSchema.methods.addHistoricalValue = function() {
    this.historical_values.push({
        date: new Date(),
        total_value: this.total_value,
        total_invested: this.total_invested,
        total_return: this.total_return,
        return_percentage: this.total_return_percentage
    });
    
    // Keep only last 365 days
    if (this.historical_values.length > 365) {
        this.historical_values = this.historical_values.slice(-365);
    }
    
    return this.save();
};

portfolioSchema.methods.updateAssetAllocation = function(allocation) {
    this.asset_allocation = allocation;
    
    // Calculate percentages
    if (this.total_value > 0) {
        Object.keys(this.asset_allocation).forEach(assetType => {
            this.asset_allocation[assetType].percentage = 
                (this.asset_allocation[assetType].value / this.total_value) * 100;
        });
    }
    
    return this.save();
};

portfolioSchema.methods.checkRebalancing = function() {
    const target = this.rebalancing.target_allocation;
    const current = this.asset_allocation;
    const threshold = this.rebalancing.rebalancing_threshold;
    
    let needsRebalancing = false;
    const recommendations = [];
    
    Object.keys(target).forEach(assetType => {
        if (target[assetType]) {
            const diff = current[assetType].percentage - target[assetType];
            
            if (Math.abs(diff) > threshold) {
                needsRebalancing = true;
                
                recommendations.push({
                    asset_type: assetType,
                    action: diff > 0 ? 'sell' : 'buy',
                    percentage: Math.abs(diff),
                    amount: (Math.abs(diff) / 100) * this.total_value,
                    reason: `Current: ${current[assetType].percentage.toFixed(1)}%, Target: ${target[assetType]}%`
                });
            }
        }
    });
    
    this.rebalancing.needs_rebalancing = needsRebalancing;
    this.rebalancing.recommendations = recommendations;
    
    return this.save();
};

portfolioSchema.methods.updateDividendIncome = function(amount) {
    this.dividend_income.total += amount;
    this.dividend_income.ytd += amount;
    this.dividend_income.last_12_months += amount;
    
    return this.save();
};

// Static methods
portfolioSchema.statics.getUserPortfolios = function(userId) {
    return this.find({ user: userId, is_active: true })
        .sort({ createdAt: -1 });
};

portfolioSchema.statics.getTotalPortfolioValue = async function(userId) {
    const portfolios = await this.find({ user: userId, is_active: true });
    return portfolios.reduce((sum, p) => sum + p.total_value, 0);
};

module.exports = mongoose.model('Portfolio', portfolioSchema);
