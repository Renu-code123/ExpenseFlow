const mongoose = require('mongoose');

/**
 * AuditMerkle Model
 * Issue #782: Storing chronological roots of the ledger hash-tree.
 * Provides a cryptographic anchor for the entire event stream.
 */
const auditMerkleSchema = new mongoose.Schema({
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    rootHash: {
        type: String,
        required: true
    },
    eventCount: {
        type: Number,
        required: true
    },
    startSequence: {
        type: Number,
        required: true
    },
    endSequence: {
        type: Number,
        required: true
    },
    treeDepth: {
        type: Number,
        required: true
    },
    prevRootHash: {
        type: String,
        required: true // Chains the Merkle roots together
    },
    period: {
        type: String, // 'daily', 'hourly', etc.
        default: 'daily'
    },
    isVerified: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Index for chronological auditing
auditMerkleSchema.index({ workspaceId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditMerkle', auditMerkleSchema);
