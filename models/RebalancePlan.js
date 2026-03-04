const mongoose = require('mongoose');

/**
 * RebalancePlan Model
 * Issue #959: Storing scheduled JIT capital movements.
 * Maps anticipated liquidity needs to specific execution windows.
 */
const rebalancePlanSchema = new mongoose.Schema({
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    sourceNodeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TreasuryNode',
        required: true
    },
    targetNodeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TreasuryNode',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    executionWindow: {
        start: { type: Date, required: true },
        end: { type: Date, required: true }
    },
    priority: {
        type: String,
        enum: ['CRITICAL', 'OPTIMIZATION', 'MAINTENANCE'],
        default: 'OPTIMIZATION'
    },
    status: {
        type: String,
        enum: ['PENDING', 'EXECUTED', 'CANCELLED', 'FAILED'],
        default: 'PENDING'
    },
    triggerType: {
        type: String,
        enum: ['FORECAST_PROjection', 'REAL_TIME_GUARD', 'NIGHTLY_SWEEP'],
        required: true
    },
    yieldGainProjection: Number,
    failureReason: String
}, {
    timestamps: true
});

rebalancePlanSchema.index({ 'executionWindow.start': 1, status: 1 });

module.exports = mongoose.model('RebalancePlan', rebalancePlanSchema);
