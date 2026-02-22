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
        enum: ['TRANSACTION', 'BUDGET', 'WORKSPACE'],
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
            'FROZEN'
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
    }
}, {
    timestamps: false // We use our own timestamp
});

// Compound index for unique sequence per entity
financialEventSchema.index({ entityId: 1, sequence: 1 }, { unique: true });

module.exports = mongoose.model('FinancialEvent', financialEventSchema);
