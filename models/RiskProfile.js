const mongoose = require('mongoose');

/**
 * Risk Profile Model
 * Issue #645: Stores per-user spending baselines and historical risk levels
 */
const riskProfileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    baselines: {
        dailyAvg: { type: Number, default: 0 },
        dailyStdDev: { type: Number, default: 0 },
        monthlyAvg: { type: Number, default: 0 },
        categoryAverages: {
            type: Map,
            of: Number,
            default: {}
        }
    },
    riskScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    historicalFlags: [{
        transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
        reason: String,
        scoreAtTime: Number,
        timestamp: { type: Date, default: Date.now }
    }],
    lastAnalyzedAt: {
        type: Date,
        default: Date.now
    },
    securityPreferences: {
        blockHighRisk: { type: Boolean, default: false },
        notifyRiskLevel: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'high'
        }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('RiskProfile', riskProfileSchema);
