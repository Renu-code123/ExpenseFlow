const mongoose = require('mongoose');

/**
 * SyncConflict Model
 * Issue #705: Stores conflicting edits detected via vector clocks.
 * Allows for manual or automatic field-level resolution.
 */
const syncConflictSchema = new mongoose.Schema({
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    entityType: {
        type: String,
        required: true, // e.g., 'Transaction'
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    baseState: mongoose.Schema.Types.Mixed,
    conflictingStates: [{
        deviceId: String,
        state: mongoose.Schema.Types.Mixed,
        vectorClock: {
            type: Map,
            of: Number
        },
        timestamp: { type: Date, default: Date.now }
    }],
    resolvedState: mongoose.Schema.Types.Mixed,
    resolvedAt: Date,
    resolutionStrategy: {
        type: String,
        enum: ['manual', 'auto_merge', 'last_write_wins', 'source_wins'],
        default: 'manual'
    },
    status: {
        type: String,
        enum: ['open', 'resolved', 'ignored'],
        default: 'open',
        index: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('SyncConflict', syncConflictSchema);
