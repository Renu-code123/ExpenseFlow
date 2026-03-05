const mongoose = require('mongoose');

/**
 * SpendForecast Model
 * Stores predictive spend projections with confidence intervals
 */
const forecastDataPointSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    predictedAmount: {
        type: Number,
        required: true
    },
    lowerBound: {
        type: Number,
        required: true
    },
    upperBound: {
        type: Number,
        required: true
    },
    confidence: {
        type: Number,
        default: 95,
        min: 0,
        max: 100
    },
    actualAmount: Number,
    variance: Number
}, { _id: false });

const spendForecastSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    budgetId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Budget',
        index: true
    },
    category: String,
    forecastId: {
        type: String,
        unique: true,
        required: true
    },
    forecastDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    forecastPeriod: {
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            required: true
        },
        periodType: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'quarterly'],
            default: 'monthly'
        }
    },
    historicalPeriod: {
        startDate: Date,
        endDate: Date,
        dataPoints: Number
    },
    forecastMethod: {
        type: String,
        enum: ['linear', 'exponential', 'seasonal', 'moving_average', 'ensemble'],
        required: true
    },
    dataPoints: [forecastDataPointSchema],
    summary: {
        totalPredicted: {
            type: Number,
            default: 0
        },
        averageDaily: {
            type: Number,
            default: 0
        },
        peakPredicted: {
            type: Number,
            default: 0
        },
        peakDate: Date,
        trend: {
            type: String,
            enum: ['increasing', 'decreasing', 'stable']
        },
        trendStrength: {
            type: Number,
            min: 0,
            max: 1
        },
        seasonalityDetected: {
            type: Boolean,
            default: false
        },
        seasonalPattern: String
    },
    accuracy: {
        mape: Number, // Mean Absolute Percentage Error
        rmse: Number, // Root Mean Square Error
        mae: Number,  // Mean Absolute Error
        r2Score: Number // R-squared score
    },
    alerts: [{
        type: {
            type: String,
            enum: ['budget_overrun', 'unusual_spike', 'trend_change']
        },
        severity: {
            type: String,
            enum: ['low', 'medium', 'high']
        },
        message: String,
        date: Date,
        amount: Number
    }],
    status: {
        type: String,
        enum: ['active', 'expired', 'superseded'],
        default: 'active'
    }
}, {
    timestamps: true
});

// Pre-save hook to calculate summary
spendForecastSchema.pre('save', function (next) {
    if (this.dataPoints.length > 0) {
        this.summary.totalPredicted = this.dataPoints.reduce((sum, dp) => sum + dp.predictedAmount, 0);
        this.summary.averageDaily = this.summary.totalPredicted / this.dataPoints.length;

        // Find peak
        const peak = this.dataPoints.reduce((max, dp) =>
            dp.predictedAmount > max.predictedAmount ? dp : max
        );
        this.summary.peakPredicted = peak.predictedAmount;
        this.summary.peakDate = peak.date;

        // Determine trend
        if (this.dataPoints.length >= 3) {
            const firstThird = this.dataPoints.slice(0, Math.floor(this.dataPoints.length / 3));
            const lastThird = this.dataPoints.slice(-Math.floor(this.dataPoints.length / 3));

            const firstAvg = firstThird.reduce((sum, dp) => sum + dp.predictedAmount, 0) / firstThird.length;
            const lastAvg = lastThird.reduce((sum, dp) => sum + dp.predictedAmount, 0) / lastThird.length;

            const change = ((lastAvg - firstAvg) / firstAvg) * 100;

            if (change > 5) {
                this.summary.trend = 'increasing';
                this.summary.trendStrength = Math.min(change / 100, 1);
            } else if (change < -5) {
                this.summary.trend = 'decreasing';
                this.summary.trendStrength = Math.min(Math.abs(change) / 100, 1);
            } else {
                this.summary.trend = 'stable';
                this.summary.trendStrength = 0;
            }
        }
    }

    next();
});

// Indexes
spendForecastSchema.index({ userId: 1, forecastDate: -1 });
spendForecastSchema.index({ budgetId: 1, status: 1 });
spendForecastSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('SpendForecast', spendForecastSchema);
