const mongoose = require('mongoose');

/**
 * ValidationLog Model
 * Issue #704: Per-request log of validation stages and remediation actions.
 */
const validationLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    entityType: {
        type: String,
        default: 'Transaction',
        index: true
    },
    requestId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    stages: [{
        name: String, // 'schema', 'semantic', 'remediation', 'final'
        status: { type: String, enum: ['passed', 'failed', 'remediated'] },
        errors: [String],
        timestamp: { type: Date, default: Date.now }
    }],
    initialData: mongoose.Schema.Types.Mixed,
    finalData: mongoose.Schema.Types.Mixed,
    purityScore: {
        type: Number,
        min: 0,
        max: 100
    },
    remediationsApplied: [{
        field: String,
        action: String, // 'fixed_casing', 'clipped_date', 'normalized_merchant'
        originalValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('ValidationLog', validationLogSchema);
