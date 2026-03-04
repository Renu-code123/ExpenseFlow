const mongoose = require('mongoose');

/**
 * MoneyLineage Model
 * Issue #866: Tracking the "Source-DNA" of virtual liquidity fragments.
 * Every dollar in the treasury is tagged with its provenance (origin).
 */
const moneyLineageSchema = new mongoose.Schema({
    treasuryNodeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TreasuryNode',
        required: true,
        index: true
    },
    sourceDna: {
        type: String,
        required: true,
        enum: ['VENTURE_CAPITAL', 'STATE_GRANT', 'REVENUE', 'LOAN', 'EQUITY'],
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    restrictions: [{
        category: String, // Approved category (e.g., 'R&D', 'ADMIN')
        maxPercent: Number,
        expiresAt: Date
    }],
    provenanceHash: {
        type: String,
        required: true,
        unique: true
    }, // Cryptographic link to the origin transaction
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Compound index for querying available funds by source and node
moneyLineageSchema.index({ treasuryNodeId: 1, sourceDna: 1 });

module.exports = mongoose.model('MoneyLineage', moneyLineageSchema);
