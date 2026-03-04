const mongoose = require('mongoose');

/**
 * SearchIndex Model
 * Issue #756: Stores flattened, tokenized vectors for high-performance multi-tenant search.
 * This decouples search from the main transaction store for scalability.
 */
const searchIndexSchema = new mongoose.Schema({
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    entityType: {
        type: String,
        enum: ['TRANSACTION', 'USER', 'PROJECT', 'BUDGET'],
        required: true,
        index: true
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    tokens: [{
        type: String,
        index: true
    }],
    metadata: {
        description: String,
        amount: Number,
        category: String,
        merchant: String,
        date: Date
    },
    score: {
        type: Number,
        default: 1.0
    },
    lastIndexedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound indexes for multi-tenant isolation and fast lookup
searchIndexSchema.index({ workspaceId: 1, tokens: 1 });
searchIndexSchema.index({ userId: 1, tokens: 1 });
searchIndexSchema.index({ entityType: 1, lastIndexedAt: -1 });

module.exports = mongoose.model('SearchIndex', searchIndexSchema);
