const mongoose = require('mongoose');

/**
 * VaultMetadata Model
 * Issue #679: Stores non-sensitive metadata for user-side decryption.
 */
const vaultMetadataSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    salt: {
        type: String,
        required: true // Used for key derivation
    },
    keyRotationVersion: {
        type: Number,
        default: 1
    },
    lastRotatedAt: {
        type: Date,
        default: Date.now
    },
    isEncryptedVaultEnabled: {
        type: Boolean,
        default: false
    },
    recoveryHint: String
}, {
    timestamps: true
});

module.exports = mongoose.model('VaultMetadata', vaultMetadataSchema);
