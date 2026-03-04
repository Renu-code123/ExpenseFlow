/**
 * Budget Snapshot Model  
 * Issue #554: Budget Planning & Variance Analysis System
 * Historical budget performance tracking for variance analysis
 */

const mongoose = require('mongoose');

const categorySnapshotSchema = new mongoose.Schema({
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    },
    categoryName: {
        type: String,
        required: true
    },
    allocated: {
        type: Number,
        required: true,
        min: 0
    },
    spent: {
        type: Number,
        required: true,
        min: 0
    },
    remaining: {
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
    percentageUsed: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['healthy', 'warning', 'exceeded'],
        required: true
    },
    transactionCount: {
        type: Number,
        default: 0
    }
}, { _id: false });

const budgetSnapshotSchema = new mongoose.Schema({
    budgetId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Budget',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Snapshot Period
    snapshotDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    period: {
        type: String,
        enum: ['monthly', 'quarterly', 'yearly'],
        required: true
    },
    periodStart: {
        type: Date,
        required: true
    },
    periodEnd: {
        type: Date,
        required: true
    },

    // Budget Summary
    budgetName: {
        type: String,
        required: true
    },
    totalAllocated: {
        type: Number,
        required: true
    },
    totalSpent: {
        type: Number,
        required: true
    },
    totalRemaining: {
        type: Number,
        required: true
    },
    totalVariance: {
        type: Number,
        required: true
    },
    totalVariancePercentage: {
        type: Number,
        required: true
    },

    // Category Breakdown
    categories: [categorySnapshotSchema],

    // Performance Metrics
    overallHealth: {
        type: String,
        enum: ['healthy', 'warning', 'critical', 'exceeded'],
        required: true
    },
    progressPercentage: {
        type: Number,
        required: true,
        min: 0
    },
    daysInPeriod: {
        type: Number,
        required: true
    },
    daysElapsed: {
        type: Number,
        required: true
    },
    daysRemaining: {
        type: Number,
        required: true
    },

    // Spending Velocity (daily average)
    dailySpendingRate: {
        type: Number,
        default: 0
    },
    projectedTotalSpend: {
        type: Number,
        default: 0
    },
    projectedOverspend: {
        type: Number,
        default: 0
    },

    // Alerts & Issues
    activeAlerts: [{
        level: String,
        categoryName: String,
        message: String,
        triggeredAt: Date
    }],
    alertCount: {
        type: Number,
        default: 0
    },

    // Comparison with Previous Period
    comparison: {
        previousPeriodSpent: {
            type: Number,
            default: 0
        },
        spentDifference: {
            type: Number,
            default: 0
        },
        spentDifferencePercentage: {
            type: Number,
            default: 0
        },
        trend: {
            type: String,
            enum: ['increasing', 'decreasing', 'stable'],
            default: 'stable'
        }
    },

    // Metadata
    currency: {
        type: String,
        default: 'USD'
    },
    notes: {
        type: String
    },
    snapshotType: {
        type: String,
        enum: ['daily', 'end_of_period', 'manual'],
        default: 'daily'
    }
}, {
    timestamps: true
});

// Indexes
budgetSnapshotSchema.index({ budgetId: 1, snapshotDate: -1 });
budgetSnapshotSchema.index({ userId: 1, snapshotDate: -1 });
budgetSnapshotSchema.index({ userId: 1, periodStart: 1, periodEnd: 1 });
budgetSnapshotSchema.index({ snapshotDate: -1 });

// Virtual: Is period complete
budgetSnapshotSchema.virtual('isPeriodComplete').get(function () {
    return new Date() >= this.periodEnd;
});

// Virtual: Spending efficiency (lower is better)
budgetSnapshotSchema.virtual('spendingEfficiency').get(function () {
    if (this.daysElapsed === 0) return 100;

    const expectedSpendingPercentage = (this.daysElapsed / this.daysInPeriod) * 100;
    const actualSpendingPercentage = this.progressPercentage;

    // If spending less than expected for time elapsed, good efficiency
    return Math.max(0, 100 - (actualSpendingPercentage - expectedSpendingPercentage));
});

// Virtual: Budget adherence score (0-100)
budgetSnapshotSchema.virtual('adherenceScore').get(function () {
    if (this.totalAllocated === 0) return 100;

    const categoriesOnTrack = this.categories.filter(c => c.status === 'healthy').length;
    const totalCategories = this.categories.length;

    if (totalCategories === 0) return 100;

    const categoryScore = (categoriesOnTrack / totalCategories) * 50;
    const spendingScore = Math.max(0, 50 - (this.progressPercentage - 50));

    return Math.min(100, categoryScore + spendingScore);
});

// Method: Get top overspending categories
budgetSnapshotSchema.methods.getTopOverspendingCategories = function (limit = 5) {
    return this.categories
        .filter(c => c.variance < 0)
        .sort((a, b) => a.variance - b.variance)
        .slice(0, limit)
        .map(c => ({
            categoryName: c.categoryName,
            overspent: Math.abs(c.variance),
            percentageOver: Math.abs(c.variancePercentage)
        }));
};

// Method: Get top underspending categories
budgetSnapshotSchema.methods.getTopUnderspendingCategories = function (limit = 5) {
    return this.categories
        .filter(c => c.variance > 0)
        .sort((a, b) => b.variance - a.variance)
        .slice(0, limit)
        .map(c => ({
            categoryName: c.categoryName,
            underutilized: c.variance,
            percentageUnder: c.variancePercentage
        }));
};

// Method: Get summary statistics
budgetSnapshotSchema.methods.getSummary = function () {
    return {
        budgetName: this.budgetName,
        period: this.period,
        periodStart: this.periodStart,
        periodEnd: this.periodEnd,
        snapshotDate: this.snapshotDate,
        totalAllocated: this.totalAllocated,
        totalSpent: this.totalSpent,
        totalVariance: this.totalVariance,
        totalVariancePercentage: this.totalVariancePercentage,
        overallHealth: this.overallHealth,
        daysRemaining: this.daysRemaining,
        projectedTotalSpend: this.projectedTotalSpend,
        adherenceScore: this.adherenceScore,
        alertCount: this.alertCount,
        categoriesCount: this.categories.length
    };
};

// Method: Compare with another snapshot
budgetSnapshotSchema.methods.compareWith = function (otherSnapshot) {
    if (!otherSnapshot) return null;

    return {
        spentDifference: this.totalSpent - otherSnapshot.totalSpent,
        spentDifferencePercentage: otherSnapshot.totalSpent > 0
            ? ((this.totalSpent - otherSnapshot.totalSpent) / otherSnapshot.totalSpent) * 100
            : 0,
        varianceDifference: this.totalVariance - otherSnapshot.totalVariance,
        healthImprovement: this.adherenceScore - otherSnapshot.adherenceScore,
        categoryChanges: this.categories.map(cat => {
            const prevCat = otherSnapshot.categories.find(c => c.categoryName === cat.categoryName);
            if (!prevCat) return null;

            return {
                categoryName: cat.categoryName,
                spentChange: cat.spent - prevCat.spent,
                varianceChange: cat.variance - prevCat.variance,
                statusChange: prevCat.status !== cat.status
            };
        }).filter(Boolean)
    };
};

// Static: Create snapshot from budget
budgetSnapshotSchema.statics.createFromBudget = async function (budget, snapshotType = 'daily') {
    const now = new Date();
    const periodStart = new Date(budget.startDate);
    const periodEnd = new Date(budget.endDate);

    const daysInPeriod = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
    const daysElapsed = Math.ceil((now - periodStart) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24)));

    const dailySpendingRate = daysElapsed > 0 ? budget.totalSpent / daysElapsed : 0;
    const projectedTotalSpend = dailySpendingRate * daysInPeriod;
    const projectedOverspend = Math.max(0, projectedTotalSpend - budget.totalAllocated);

    const categorySnapshots = budget.categories.map(cat => ({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        allocated: cat.allocatedAmount,
        spent: cat.spentAmount,
        remaining: cat.remainingAmount,
        variance: cat.allocatedAmount - cat.spentAmount,
        variancePercentage: cat.allocatedAmount > 0
            ? ((cat.allocatedAmount - cat.spentAmount) / cat.allocatedAmount) * 100
            : 0,
        percentageUsed: cat.percentageUsed,
        status: cat.status
    }));

    // Get previous snapshot for comparison
    const previousSnapshot = await this.findOne({
        budgetId: budget._id
    }).sort({ snapshotDate: -1 });

    const comparison = {
        previousPeriodSpent: previousSnapshot ? previousSnapshot.totalSpent : 0,
        spentDifference: previousSnapshot ? budget.totalSpent - previousSnapshot.totalSpent : 0,
        spentDifferencePercentage: previousSnapshot && previousSnapshot.totalSpent > 0
            ? ((budget.totalSpent - previousSnapshot.totalSpent) / previousSnapshot.totalSpent) * 100
            : 0,
        trend: 'stable'
    };

    if (comparison.spentDifference > 0) comparison.trend = 'increasing';
    else if (comparison.spentDifference < 0) comparison.trend = 'decreasing';

    const snapshotData = {
        budgetId: budget._id,
        userId: budget.userId,
        snapshotDate: now,
        period: budget.period,
        periodStart: budget.startDate,
        periodEnd: budget.endDate,
        budgetName: budget.name,
        totalAllocated: budget.totalAllocated,
        totalSpent: budget.totalSpent,
        totalRemaining: budget.totalRemaining,
        totalVariance: budget.totalAllocated - budget.totalSpent,
        totalVariancePercentage: budget.totalAllocated > 0
            ? ((budget.totalAllocated - budget.totalSpent) / budget.totalAllocated) * 100
            : 0,
        categories: categorySnapshots,
        overallHealth: budget.overallHealth,
        progressPercentage: budget.progressPercentage,
        daysInPeriod,
        daysElapsed,
        daysRemaining,
        dailySpendingRate,
        projectedTotalSpend,
        projectedOverspend,
        activeAlerts: budget.alerts.filter(a => !a.acknowledged),
        alertCount: budget.alerts.filter(a => !a.acknowledged).length,
        comparison,
        currency: budget.currency,
        snapshotType
    };

    return new this(snapshotData);
};

// Static: Get performance history
budgetSnapshotSchema.statics.getPerformanceHistory = async function (userId, months = 12) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    return await this.find({
        userId,
        snapshotDate: { $gte: startDate },
        snapshotType: 'end_of_period'
    }).sort({ snapshotDate: -1 });
};

module.exports = mongoose.model('BudgetSnapshot', budgetSnapshotSchema);
