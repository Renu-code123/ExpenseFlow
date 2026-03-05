const mongoose = require('mongoose');

/**
 * BudgetVariance Model
 * Stores detailed variance analysis results for budget monitoring
 */
const varianceItemSchema = new mongoose.Schema({
    category: String,
    subcategory: String,
    budgetedAmount: {
        type: Number,
        required: true
    },
    actualAmount: {
        type: Number,
        required: true
    },
    variance: {
        type: Number,
        required: true
    },
    variancePercentage: {
        type: Number,
        required: true
    },
    varianceType: {
        type: String,
        enum: ['favorable', 'unfavorable', 'neutral'],
        required: true
    },
    anomalyScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    isAnomaly: {
        type: Boolean,
        default: false
    },
    transactionCount: {
        type: Number,
        default: 0
    }
}, { _id: false });

const budgetVarianceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    budgetId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Budget',
        required: true,
        index: true
    },
    budgetName: String,
    analysisDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    period: {
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
            enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
            default: 'monthly'
        }
    },
    items: [varianceItemSchema],
    summary: {
        totalBudgeted: {
            type: Number,
            default: 0
        },
        totalActual: {
            type: Number,
            default: 0
        },
        totalVariance: {
            type: Number,
            default: 0
        },
        variancePercentage: {
            type: Number,
            default: 0
        },
        favorableVariances: {
            type: Number,
            default: 0
        },
        unfavorableVariances: {
            type: Number,
            default: 0
        },
        anomaliesDetected: {
            type: Number,
            default: 0
        },
        utilizationRate: {
            type: Number,
            default: 0
        }
    },
    alerts: [{
        severity: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical']
        },
        category: String,
        message: String,
        recommendedAction: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    trends: {
        isIncreasing: Boolean,
        trendPercentage: Number,
        projectedOverrun: Number,
        daysUntilOverrun: Number
    },
    status: {
        type: String,
        enum: ['on_track', 'warning', 'critical', 'exceeded'],
        default: 'on_track'
    }
}, {
    timestamps: true
});

// Pre-save hook to calculate summary
budgetVarianceSchema.pre('save', function (next) {
    this.summary.totalBudgeted = this.items.reduce((sum, i) => sum + i.budgetedAmount, 0);
    this.summary.totalActual = this.items.reduce((sum, i) => sum + i.actualAmount, 0);
    this.summary.totalVariance = this.summary.totalActual - this.summary.totalBudgeted;

    if (this.summary.totalBudgeted > 0) {
        this.summary.variancePercentage = (this.summary.totalVariance / this.summary.totalBudgeted) * 100;
        this.summary.utilizationRate = (this.summary.totalActual / this.summary.totalBudgeted) * 100;
    }

    this.summary.favorableVariances = this.items.filter(i => i.varianceType === 'favorable').length;
    this.summary.unfavorableVariances = this.items.filter(i => i.varianceType === 'unfavorable').length;
    this.summary.anomaliesDetected = this.items.filter(i => i.isAnomaly).length;

    // Determine status
    if (this.summary.utilizationRate >= 100) {
        this.status = 'exceeded';
    } else if (this.summary.utilizationRate >= 90) {
        this.status = 'critical';
    } else if (this.summary.utilizationRate >= 75) {
        this.status = 'warning';
    } else {
        this.status = 'on_track';
    }

    next();
});

// Indexes
budgetVarianceSchema.index({ userId: 1, analysisDate: -1 });
budgetVarianceSchema.index({ budgetId: 1, 'period.startDate': 1 });
budgetVarianceSchema.index({ status: 1 });

module.exports = mongoose.model('BudgetVariance', budgetVarianceSchema);
