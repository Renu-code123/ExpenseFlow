const mongoose = require('mongoose');

/**
 * WriteJournal Model
 * Issue #769: Persistent buffer for pending state changes.
 * Part of the "Journal-First" architecture to handle distributed concurrency.
 */
const writeJournalSchema = new mongoose.Schema({
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    entityType: {
        type: String,
        required: true,
        enum: ['TRANSACTION', 'EXPENSE', 'WORKSPACE', 'USER']
    },
    operation: {
        type: String,
        required: true,
        enum: ['CREATE', 'UPDATE', 'DELETE']
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    vectorClock: {
        type: Map,
        of: Number,
        default: {}
    },
    status: {
        type: String,
        enum: ['PENDING', 'APPLIED', 'CONFLICT', 'STALE'],
        default: 'PENDING',
        index: true
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    retryCount: {
        type: Number,
        default: 0
    },
    appliedAt: Date
}, {
    timestamps: true
});

// Indexes for consensus retrieval
writeJournalSchema.index({ entityId: 1, status: 1 });
writeJournalSchema.index({ workspaceId: 1, createdAt: 1 });

module.exports = mongoose.model('WriteJournal', writeJournalSchema);
