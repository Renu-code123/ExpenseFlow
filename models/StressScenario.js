const mongoose = require('mongoose');

/**
 * StressScenario Model
 * Issue #739: Stores parameters for financial stress testing and liquidity simulations.
 */
const stressScenarioSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: String,
    parameters: {
        revenueVolatility: { type: Number, default: 0.1 }, // 10% standard deviation
        expenseSurcharge: { type: Number, default: 0.05 },  // 5% unexpected cost increase
        currencyFluctuation: { type: Number, default: 0.02 }, // 2% FX risk
        defaultRateIncrease: { type: Number, default: 0.01 }  // 1% increase in bad debt
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastRunAt: Date,
    successRate: Number // Historic success rate under this scenario
}, {
    timestamps: true
});

module.exports = mongoose.model('StressScenario', stressScenarioSchema);
