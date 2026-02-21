const mongoose = require('mongoose');

/**
 * SearchIndex Model
 * Issue #720: Specialized flat collection for high-performance multi-faceted search.
 * Denormalizes transaction data to avoid expensive joins during search.
 */
const searchIndexSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction',
        required: true,
        unique: true
    },
    // Denormalized fields for fast filtering
    searchText: {
        type: String,
        required: true,
        index: 'text' // Full text search index
    },
    merchant: {
        type: String,
        index: true
    },
    amount: {
        type: Number,
        index: true
    },
    currency: {
        type: String,
        uppercase: true,
        index: true
    },
    category: {
        type: String, // String representation for fast filtering
        index: true
    },
    date: {
        type: Date,
        index: true
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        index: true
    },
    // Extracted Facets
    tags: [{
        type: String,
        index: true
    }],
    sentiment: {
        type: String,
        enum: ['positive', 'neutral', 'negative'],
        index: true
    },
    businessType: {
        type: String,
        index: true
    },
    isRecurring: {
        type: Boolean,
        index: true
    },
    // Metadata
    lastIndexedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    autoIndex: true
});

// Compound indexes for common query patterns
searchIndexSchema.index({ userId: 1, date: -1 });
searchIndexSchema.index({ userId: 1, amount: 1 });
searchIndexSchema.index({ userId: 1, tags: 1 });

module.exports = mongoose.model('SearchIndex', searchIndexSchema);
