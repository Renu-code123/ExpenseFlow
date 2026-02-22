const mongoose = require('mongoose');

/**
 * SyncConflict Model
 * Issue #730: Stores conflicting state snapshots for distributed transaction reconciliation.
 * Acts as a "Conflict Graveyard" for manual or automatic resolution.
 */
const syncConflictSchema = new mongoose.Schema({
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        index: true
    },
    baseState: mongoose.Schema.Types.Mixed,
    serverState: mongoose.Schema.Types.Mixed,
    clientState: mongoose.Schema.Types.Mixed,
    vectorClocks: {
        server: { type: Map, of: Number },
        client: { type: Map, of: Number }
    },
    conflictType: {
        type: String,
        enum: ['concurrent_update', 'delete_update_collision', 'logic_violation'],
        default: 'concurrent_update'
    },
    status: {
        type: String,
        enum: ['open', 'resolved', 'ignored'],
        default: 'open',
        index: true
    },
    resolutionStrategy: String, // 'client_wins', 'server_wins', 'merge', 'manual'
    resolvedAt: Date,
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    checksum: String
}, {
    timestamps: true
});

module.exports = mongoose.model('SyncConflict', syncConflictSchema);
