const mongoose = require('mongoose');

/**
 * MultiSigWallet Model
 * Issue #797: Multi-Signature Consensus & Dynamic Approval Topologies
 * Tracks quorum requirements and pending signature states for treasury operations.
 */

const signatureSchema = new mongoose.Schema({
    signerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    signedAt: {
        type: Date,
        default: Date.now
    },
    signatureHash: {
        type: String,
        required: true
    },
    // Cryptographic proof type
    proofType: {
        type: String,
        enum: ['PASSWORD', 'TOTP', 'HARDWARE_KEY', 'BIOMETRIC', 'PKI'],
        required: true
    },
    // Device/session metadata for audit
    deviceFingerprint: String,
    ipAddress: String,
    userAgent: String,
    // Verification status
    verified: {
        type: Boolean,
        default: false
    },
    verifiedAt: Date,
    verificationMethod: String
}, { _id: true });

const pendingOperationSchema = new mongoose.Schema({
    operationId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    operationType: {
        type: String,
        enum: ['VIRTUAL_TRANSFER', 'VAULT_WITHDRAWAL', 'POLICY_CHANGE', 'THRESHOLD_UPDATE', 'EMERGENCY_OVERRIDE'],
        required: true
    },
    // The actual operation payload
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    // Amount in base currency (for threshold checks)
    amount: {
        type: Number,
        default: 0
    },
    // Initiator
    initiatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    initiatedAt: {
        type: Date,
        default: Date.now
    },
    // Quorum configuration for this operation
    requiredSignatures: {
        type: Number,
        required: true,
        min: 1
    },
    totalEligibleSigners: {
        type: Number,
        required: true
    },
    // M-of-N configuration
    quorumConfig: {
        m: { type: Number, required: true }, // Required signatures
        n: { type: Number, required: true }, // Total eligible
        thresholdPercent: Number // Alternative: percentage-based
    },
    // Collected signatures
    signatures: [signatureSchema],
    // Status tracking
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED', 'CANCELLED'],
        default: 'PENDING',
        index: true
    },
    // Expiration
    expiresAt: {
        type: Date,
        required: true
    },
    // Resolution
    resolvedAt: Date,
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    executionResult: mongoose.Schema.Types.Mixed,
    // Escalation tracking
    escalationLevel: {
        type: Number,
        default: 0
    },
    lastEscalatedAt: Date,
    escalationHistory: [{
        level: Number,
        escalatedAt: Date,
        reason: String,
        notifiedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    }],
    // Rejection tracking
    rejections: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        rejectedAt: { type: Date, default: Date.now },
        reason: String
    }]
}, { timestamps: true });

const multiSigWalletSchema = new mongoose.Schema({
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    walletName: {
        type: String,
        required: true
    },
    description: String,
    // Linked treasury vault
    vaultId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TreasuryVault'
    },
    // Default quorum configuration
    defaultQuorum: {
        m: { type: Number, required: true, min: 1 }, // Required signatures
        n: { type: Number, required: true, min: 1 }, // Total signers
        mode: {
            type: String,
            enum: ['FIXED', 'PERCENTAGE', 'THRESHOLD_BASED'],
            default: 'FIXED'
        }
    },
    // Threshold-based quorum rules
    thresholdRules: [{
        minAmount: { type: Number, required: true },
        maxAmount: Number, // null = unlimited
        requiredM: { type: Number, required: true },
        requiredProofTypes: [{
            type: String,
            enum: ['PASSWORD', 'TOTP', 'HARDWARE_KEY', 'BIOMETRIC', 'PKI']
        }],
        maxApprovalHours: { type: Number, default: 24 }
    }],
    // Authorized signers
    authorizedSigners: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        role: {
            type: String,
            enum: ['OWNER', 'ADMIN', 'SIGNER', 'AUDITOR'],
            default: 'SIGNER'
        },
        weight: {
            type: Number,
            default: 1,
            min: 1
        },
        canInitiate: { type: Boolean, default: true },
        canApprove: { type: Boolean, default: true },
        canReject: { type: Boolean, default: false },
        addedAt: { type: Date, default: Date.now },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        // Required proof types for this signer
        requiredProofTypes: [{
            type: String,
            enum: ['PASSWORD', 'TOTP', 'HARDWARE_KEY', 'BIOMETRIC', 'PKI']
        }]
    }],
    // Pending operations
    pendingOperations: [pendingOperationSchema],
    // Approval chain inheritance
    inheritFromWorkspace: {
        type: Boolean,
        default: true
    },
    parentPolicyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PolicyNode'
    },
    // Activity
    isActive: {
        type: Boolean,
        default: true
    },
    // Statistics
    stats: {
        totalOperations: { type: Number, default: 0 },
        approvedOperations: { type: Number, default: 0 },
        rejectedOperations: { type: Number, default: 0 },
        expiredOperations: { type: Number, default: 0 },
        averageApprovalTimeMs: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
multiSigWalletSchema.index({ workspaceId: 1, isActive: 1 });
multiSigWalletSchema.index({ 'authorizedSigners.userId': 1 });
multiSigWalletSchema.index({ 'pendingOperations.status': 1, 'pendingOperations.expiresAt': 1 });

/**
 * Get the required quorum for a given amount
 */
multiSigWalletSchema.methods.getQuorumForAmount = function(amount) {
    // Sort rules by minAmount descending to find the applicable rule
    const sortedRules = [...this.thresholdRules].sort((a, b) => b.minAmount - a.minAmount);
    
    for (const rule of sortedRules) {
        if (amount >= rule.minAmount && (!rule.maxAmount || amount <= rule.maxAmount)) {
            return {
                m: rule.requiredM,
                n: this.authorizedSigners.filter(s => s.canApprove).length,
                requiredProofTypes: rule.requiredProofTypes,
                maxApprovalHours: rule.maxApprovalHours
            };
        }
    }
    
    // Fall back to default quorum
    return {
        m: this.defaultQuorum.m,
        n: this.defaultQuorum.n,
        requiredProofTypes: ['PASSWORD'],
        maxApprovalHours: 24
    };
};

/**
 * Check if a user can sign an operation
 */
multiSigWalletSchema.methods.canUserSign = function(userId, operationId) {
    const signer = this.authorizedSigners.find(s => s.userId.equals(userId) && s.canApprove);
    if (!signer) return { canSign: false, reason: 'User not authorized to sign' };
    
    const operation = this.pendingOperations.find(op => op.operationId === operationId);
    if (!operation) return { canSign: false, reason: 'Operation not found' };
    
    if (operation.status !== 'PENDING') {
        return { canSign: false, reason: `Operation is ${operation.status}` };
    }
    
    if (new Date() > operation.expiresAt) {
        return { canSign: false, reason: 'Operation has expired' };
    }
    
    const alreadySigned = operation.signatures.some(sig => sig.signerId.equals(userId));
    if (alreadySigned) {
        return { canSign: false, reason: 'User has already signed' };
    }
    
    return { canSign: true, signer, operation };
};

/**
 * Check if quorum is reached for an operation
 */
multiSigWalletSchema.methods.isQuorumReached = function(operationId) {
    const operation = this.pendingOperations.find(op => op.operationId === operationId);
    if (!operation) return false;
    
    const verifiedSignatures = operation.signatures.filter(sig => sig.verified);
    
    // Calculate weighted signatures
    let totalWeight = 0;
    for (const sig of verifiedSignatures) {
        const signer = this.authorizedSigners.find(s => s.userId.equals(sig.signerId));
        totalWeight += signer ? signer.weight : 1;
    }
    
    return totalWeight >= operation.requiredSignatures;
};

/**
 * Get operation status summary
 */
multiSigWalletSchema.methods.getOperationSummary = function(operationId) {
    const operation = this.pendingOperations.find(op => op.operationId === operationId);
    if (!operation) return null;
    
    const verifiedSignatures = operation.signatures.filter(sig => sig.verified);
    const pendingSignatures = operation.signatures.filter(sig => !sig.verified);
    
    return {
        operationId: operation.operationId,
        operationType: operation.operationType,
        amount: operation.amount,
        status: operation.status,
        requiredSignatures: operation.requiredSignatures,
        collectedSignatures: verifiedSignatures.length,
        pendingVerification: pendingSignatures.length,
        remainingNeeded: Math.max(0, operation.requiredSignatures - verifiedSignatures.length),
        expiresAt: operation.expiresAt,
        isExpired: new Date() > operation.expiresAt,
        timeRemainingMs: Math.max(0, operation.expiresAt - new Date()),
        escalationLevel: operation.escalationLevel,
        signers: operation.signatures.map(sig => ({
            signerId: sig.signerId,
            signedAt: sig.signedAt,
            proofType: sig.proofType,
            verified: sig.verified
        }))
    };
};

module.exports = mongoose.model('MultiSigWallet', multiSigWalletSchema);
