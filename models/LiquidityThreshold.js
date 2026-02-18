const mongoose = require('mongoose');

/**
 * LiquidityThreshold Model
 * Defines alert triggers and automated actions when cash runway falls below critical levels
 */
const liquidityThresholdSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    vaultId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TreasuryVault',
        required: true
    },
    thresholdName: {
        type: String,
        required: true
    },
    thresholdType: {
        type: String,
        enum: ['absolute', 'percentage', 'runway_days'],
        required: true
    },
    triggerValue: {
        type: Number,
        required: true
    },
    currentValue: {
        type: Number,
        default: 0
    },
    severity: {
        type: String,
        enum: ['info', 'warning', 'critical', 'emergency'],
        default: 'warning'
    },
    alertChannels: [{
        type: String,
        enum: ['email', 'sms', 'dashboard', 'webhook']
    }],
    automatedActions: [{
        actionType: {
            type: String,
            enum: ['freeze_spending', 'notify_stakeholders', 'trigger_rebalance', 'liquidate_assets']
        },
        actionParams: mongoose.Schema.Types.Mixed
    }],
    lastTriggered: {
        type: Date,
        default: null
    },
    triggerCount: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    cooldownPeriod: {
        type: Number,
        default: 24 // hours
    }
}, {
    timestamps: true
});

// Index for efficient threshold monitoring
liquidityThresholdSchema.index({ userId: 1, vaultId: 1, isActive: 1 });
liquidityThresholdSchema.index({ severity: 1, isActive: 1 });

module.exports = mongoose.model('LiquidityThreshold', liquidityThresholdSchema);
