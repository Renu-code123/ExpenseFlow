const mongoose = require('mongoose');

/**
 * ZKAttestation Model
 * Issue #899: Storing public parameters and proof roots for Zero-Knowledge audits.
 * Allows trustless verification that a transaction followed policy without revealing PII.
 */
const zkAttestationSchema = new mongoose.Schema({
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction',
        required: true,
        unique: true,
        index: true
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    verificationKeyId: {
        type: String,
        required: true
    },
    publicSignals: {
        type: [String],
        required: true,
        default: []
    },
    proofHash: {
        type: String,
        required: true
    },
    complianceRoot: {
        type: String,
        required: true
    },
    proofStatus: {
        type: String,
        enum: ['pending', 'generated', 'verified', 'rejected'],
        default: 'pending',
        required: true
    },
    generatedAt: {
        type: Date,
        default: Date.now,
        immutable: true
    }
}, {
    timestamps: true
});

// Index for fast lookups
zkAttestationSchema.index({ transactionId: 1 });

// Prevent mutation after verification
zkAttestationSchema.pre('save', function(next) {
    if (this.isModified() && this.proofStatus === 'verified') {
        // Allow only status change to rejected if needed, but prevent other changes
        const modifiedPaths = this.modifiedPaths();
        const allowedModifications = ['proofStatus'];
        for (const path of modifiedPaths) {
            if (!allowedModifications.includes(path)) {
                return next(new Error('Attestation cannot be modified after verification'));
            }
        }
    }
    next();
});

module.exports = mongoose.model('ZKAttestation', zkAttestationSchema);
