const mongoose = require('mongoose');

/**
 * LiquidityForecast Model
 * Issue #909: Probabilistic cash-flow projections and insolvency risks.
 * Stores the output of Monte Carlo simulations and stress tests.
 */
const liquidityForecastSchema = new mongoose.Schema({
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    simulationDate: {
        type: Date,
        default: Date.now,
        index: true
    },
    horizonDays: {
        type: Number,
        default: 90
    }, // 30, 60, 90 day projections
    projections: [{
        date: Date,
        p10: Number, // 10th percentile (Worst Case)
        p50: Number, // 50th percentile (Expected Case)
        p90: Number, // 90th percentile (Best Case)
        insolvencyRisk: Number // Probability of balance < 0
    }],
    stressTestScenarios: [{
        name: String, // e.g., "Revenue Drop 20%", "R&D Spike"
        impactDate: Date,
        projectedBalance: Number,
        isViable: Boolean
    }],
    strategicSpendWindows: [{
        startDate: Date,
        endDate: Date,
        suggestedMaxAmount: Number,
        reason: String
    }],
    currentBurnRate: Number,
    runwayDays: Number
}, {
    timestamps: true
});

module.exports = mongoose.model('LiquidityForecast', liquidityForecastSchema);
