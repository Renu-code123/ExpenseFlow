const mongoose = require('mongoose');

/**
 * KeyNode Model
 * Issue #770: Storing per-tenant wrapped encryption keys.
 * A central system master key (KMS) wraps these tenant-specific keys.
 */
const keyNodeSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        unique: true,
        index: true
    },
    encryptedKey: {
        type: String, // The AES-256 key, encrypted by the Master Application Key
        required: true
    },
    iv: {
        type: String, // Initialization vector for the encryptedKey
        required: true
    },
    authTag: {
        type: String, // GCM Authentication Tag
        required: true
    },
    algorithm: {
        type: String,
        default: 'aes-256-gcm'
    },
    version: {
        type: Number,
        default: 1
    },
    lastRotatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('KeyNode', keyNodeSchema);
