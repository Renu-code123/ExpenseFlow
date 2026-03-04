const mongoose = require('mongoose');

/**
 * FinancialEvent Model
 * Issue #738: Stores every state change as an immutable event record.
 * This is the source of truth for the transaction system.
 */
const financialEventSchema = new mongoose.Schema({
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true // The Transaction ID
    },
    entityType: {
        type: String,
        enum: ['TRANSACTION', 'BUDGET', 'WORKSPACE', 'TREASURY_NODE', 'TAX_OPTIMIZATION_NODE', 'PRIVACY_BRIDGE'],
        default: 'TRANSACTION'
    },
    eventType: {
        type: String,
        required: true,
        enum: [
            'CREATED',
            'UPDATED',
            'DELETED',
            'RECONCILED',
            'VOIDED',
            'FROZEN',
            'VIRTUAL_TRANSFER',
            'FUNDS_RESERVED',
            'FUNDS_RELEASED',
            'TAX_DEDUCTION_ESTIMATED',
            'PRIVACY_AGGREGATE'
        ]
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    sequence: {
        type: Number,
        required: true
    },
    prevHash: {
        type: String,
        required: true
    },
    currentHash: {
        type: String,
        required: true
    },
    signature: {
        type: String,
        required: true
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    parentEventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FinancialEvent',
        default: null
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        index: true
    },
    forensicTraceId: {
        type: String,
        index: true // Links event to original HTTP request
    },
    chainId: {
        type: String,
        default: 'v1',
        index: true
    },
    vectorClock: {
        type: Map,
        of: Number,
        default: {}
    }
}, {
    timestamps: false // We use our own timestamp
});

// Compound index for unique sequence per entity
financialEventSchema.index({ entityId: 1, sequence: 1 }, { unique: true });

// Issue #842: Optimized index for temporal sharding queries
financialEventSchema.index({ entityId: 1, timestamp: 1, sequence: 1 });
financialEventSchema.index({ workspaceId: 1, timestamp: 1 });

// Issue #868: Causal ordering index
financialEventSchema.index({ workspaceId: 1, 'vectorClock': 1 });

module.exports = mongoose.model('FinancialEvent', financialEventSchema);
