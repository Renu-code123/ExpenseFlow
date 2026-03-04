const mongoose = require('mongoose');

/**
 * AuditCorrection Model
 * Issue #910: Storing autonomous ledger fixes and their "Repair-Confidence" scores.
 * Tracks self-healing actions taken by the Reconciliation Agent.
 */
const auditCorrectionSchema = new mongoose.Schema({
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    treasuryNodeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TreasuryNode',
        required: true
    },
    correctionType: {
        type: String,
        enum: ['DUPLICATE_REMOVAL', 'ORPHAN_MATCH', 'COMPENSATING_ENTRY', 'LEAKAGE_REPAIR'],
        required: true
    },
    discrepancyAmount: {
        type: Number,
        required: true
    },
    affectedEntityId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    }, // Reference to the transaction or event fixed
    repairConfidence: {
        type: Number,
        min: 0,
        max: 1,
        required: true
    }, // Score indicating how certain the agent is about the fix
    status: {
        type: String,
        enum: ['PROPOSED', 'APPLIED', 'REVERSED', 'USER_VERIFIED'],
        default: 'PROPOSED'
    },
    evidence: {
        bankTransactionId: String,
        matchScore: Number,
        description: String
    },
    appliedBy: {
        type: String,
        default: 'AUTONOMOUS_AGENT'
    },
    appliedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for auditing history
auditCorrectionSchema.index({ workspaceId: 1, appliedAt: -1 });

module.exports = mongoose.model('AuditCorrection', auditCorrectionSchema);
