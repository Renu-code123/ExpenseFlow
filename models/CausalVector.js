const mongoose = require('mongoose');

/**
 * CausalVector Model
 * Issue #868: Storing logical clock states (Vector Clocks) for distributed sync nodes.
 * Used to track causal dependencies and identify concurrent updates across masters.
 */
const causalVectorSchema = new mongoose.Schema({
    shardId: {
        type: String,
        required: true,
        index: true
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    nodeId: {
        type: String,
        required: true
    }, // Current node (server instance) recording the event
    vector: {
        type: Map,
        of: Number,
        default: {}
    }, // Map of node ID to logical clock value
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index for unique vector per shard and workspace
causalVectorSchema.index({ shardId: 1, workspaceId: 1 }, { unique: true });

module.exports = mongoose.model('CausalVector', causalVectorSchema);
