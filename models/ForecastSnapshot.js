const mongoose = require('mongoose');

const forecastSnapshotSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    forecastDate: {
        type: Date,
        required: true
    },
    startingBalance: {
        type: Number,
        required: true
    },
    projectionPeriodDays: {
        type: Number,
        default: 180 // 6 months
    },
    predictedRunwayDays: {
        type: Number,
        default: null // Null means infinite/stable
    },
    burnRate: {
        type: Number, // Monthly burn rate
        required: true
    },
    confidenceScore: {
        type: Number, // 0-100 score based on data consistency
        default: 0
    },
    dataPoints: [{
        date: Date,
        predictedBalance: Number,
        lowerBound: Number,
        upperBound: Number,
        type: {
            type: String,
            enum: ['actual', 'predicted', 'scenario'],
            default: 'predicted'
        }
    }],
    scenarios: [{
        name: String,
        description: String,
        adjustments: [{
            type: { type: String, enum: ['one_time', 'recurring_add', 'recurring_remove'] },
            amount: Number,
            startDate: Date,
            endDate: Date,
            description: String
        }],
        impactOnRunway: Number // Change in days
    }],
    metadata: {
        activeRecurringCount: Number,
        variableExpenseRatio: Number,
        modelUsed: {
            type: String,
            default: 'weighted_moving_average'
        }
    }
});

// Index for retrieving user's history
forecastSnapshotSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('ForecastSnapshot', forecastSnapshotSchema);
