const mongoose = require('mongoose');

/**
 * PolicyNode Model
 * Issue #780: Hierarchical compliance constraints and Circuit Breakers.
 * Issue #797: Extended with threshold-based quorum constraints.
 */
const policyNodeSchema = new mongoose.Schema({
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', index: true },
    name: { type: String, required: true },
    description: String,

    // Conditions using a JSON AST for the Predicate Engine
    conditions: { type: mongoose.Schema.Types.Mixed, required: true },

    action: {
        type: String,
        enum: ['FLAG', 'FREEZE', 'DENY', 'NOTIFY', 'REQUIRE_QUORUM'],
        required: true
    },

    targetResource: {
        type: String,
        enum: ['TRANSACTION', 'USER', 'WORKSPACE', 'TREASURY', 'MULTI_SIG'],
        default: 'TRANSACTION'
    },

    priority: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isInheritable: { type: Boolean, default: true },

    // Issue #797: Quorum-specific policy configuration
    quorumPolicy: {
        enabled: { type: Boolean, default: false },
        // Threshold amounts that trigger quorum requirements
        thresholdAmount: { type: Number, default: 10000 },
        // M-of-N configuration
        requiredSignatures: { type: Number, default: 2 },
        // Percentage-based alternative (if > 0, overrides requiredSignatures)
        requiredPercentage: { type: Number, default: 0, min: 0, max: 100 },
        // Required proof types for this policy
        requiredProofTypes: [{
            type: String,
            enum: ['PASSWORD', 'TOTP', 'HARDWARE_KEY', 'BIOMETRIC', 'PKI']
        }],
        // Maximum hours allowed for approval
        maxApprovalHours: { type: Number, default: 24 },
        // Escalation configuration
        escalationPolicy: {
            enabled: { type: Boolean, default: true },
            escalateAfterHours: { type: Number, default: 4 },
            maxEscalationLevels: { type: Number, default: 3 },
            notifyOnEscalation: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
        },
        // Operations this quorum policy applies to
        applicableOperations: [{
            type: String,
            enum: ['VIRTUAL_TRANSFER', 'VAULT_WITHDRAWAL', 'POLICY_CHANGE', 'THRESHOLD_UPDATE', 'EMERGENCY_OVERRIDE']
        }]
    },
    // Issue #907: Red-Team Robustness Profiling
    robustnessScore: { type: Number, default: 0.8, min: 0, max: 1 },
    vulnerabilityContext: {
        lastRedTeamFailure: Date,
        commonBypassVectors: [String],
        isHardened: { type: Boolean, default: false }
    },
    // Issue #961: Autonomous Tax-Jurisdiction Switchgear
    jurisdictionCode: { type: String, uppercase: true, index: true, sparse: true },
    nexusTrigger: {
        type: { type: String, enum: ['MERCHANT_LOCATION', 'IP_ORIGIN', 'CURRENCY', 'AMOUNT_THRESHOLD'] },
        threshold: Number,
        currencyCode: String
    }
}, {
    timestamps: true
});

// Index for quorum policy lookups
policyNodeSchema.index({ 'quorumPolicy.enabled': 1, workspaceId: 1 });
policyNodeSchema.index({ targetResource: 1, isActive: 1 });

/**
 * Get effective quorum requirements for an amount
 */
policyNodeSchema.methods.getQuorumRequirements = function (amount) {
    if (!this.quorumPolicy?.enabled) return null;
    if (amount < this.quorumPolicy.thresholdAmount) return null;

    return {
        requiredSignatures: this.quorumPolicy.requiredSignatures,
        requiredPercentage: this.quorumPolicy.requiredPercentage,
        requiredProofTypes: this.quorumPolicy.requiredProofTypes || ['PASSWORD'],
        maxApprovalHours: this.quorumPolicy.maxApprovalHours,
        escalationPolicy: this.quorumPolicy.escalationPolicy
    };
};

module.exports = mongoose.model('PolicyNode', policyNodeSchema);
