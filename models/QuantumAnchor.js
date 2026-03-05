const mongoose = require('mongoose');

/**
 * QuantumAnchor Model
 * Issue #960: Storing PQC-signed state roots for quantum-resistant ledger integrity.
 * Tracks periodic "Lattice-Based" snapshots of the ledger state.
 */
const quantumAnchorSchema = new mongoose.Schema({
    shardId: { type: String, required: true, index: true },
    snapshotSequence: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },

    // The Merkle/Lattice root of the ledger state at this snapshot
    stateRoot: { type: String, required: true },

    // Post-Quantum Signature over the stateRoot
    pqcSignature: {
        algorithm: { type: String, enum: ['CRYSTALS-KYBER', 'CRYSTALS-DILITHIUM', 'SPHINCS+'], default: 'CRYSTALS-DILITHIUM' },
        signature: { type: String, required: true },
        publicKey: { type: String, required: true }
    },

    // Reference to the forensic shard header this anchor protects
    shardHeaderHash: String,

    metadata: mongoose.Schema.Types.Mixed
}, {
    timestamps: true
});

quantumAnchorSchema.index({ shardId: 1, snapshotSequence: -1 });

module.exports = mongoose.model('QuantumAnchor', quantumAnchorSchema);
