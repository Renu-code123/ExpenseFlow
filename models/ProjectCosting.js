const mongoose = require('mongoose');

const projectCostingSchema = new mongoose.Schema({
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    period: {
        month: Number,
        year: Number,
        startDate: Date,
        endDate: Date
    },
    costs: {
        labor: {
            internal: { type: Number, default: 0 },
            contractual: { type: Number, default: 0 },
            hours: { type: Number, default: 0 }
        },
        expenses: {
            travel: { type: Number, default: 0 },
            software: { type: Number, default: 0 },
            hardware: { type: Number, default: 0 },
            others: { type: Number, default: 0 }
        },
        overhead: { type: Number, default: 0 }
    },
    revenue: {
        billed: { type: Number, default: 0 },
        accrued: { type: Number, default: 0 },
        unbilled: { type: Number, default: 0 }
    },
    metrics: {
        grossMargin: { type: Number, default: 0 },
        netMargin: { type: Number, default: 0 },
        roi: { type: Number, default: 0 },
        efficiencyRatio: { type: Number, default: 0 }, // Revenue per Labor Hour
        burnRate: { type: Number, default: 0 }
    },
    projections: {
        estimatedCostToComplete: { type: Number, default: 0 },
        projectedMarginAtCompletion: { type: Number, default: 0 },
        varianceAtCompletion: { type: Number, default: 0 }
    },
    inventoryUsed: [{
        item: String,
        quantity: Number,
        cost: Number
    }],
    lastCalculationAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes
projectCostingSchema.index({ userId: 1, 'period.year': 1, 'period.month': 1 });
projectCostingSchema.index({ projectId: 1, lastCalculationAt: -1 });

module.exports = mongoose.model('ProjectCosting', projectCostingSchema);
