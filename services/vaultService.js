const VaultMetadata = require('../models/VaultMetadata');
const cryptoPayload = require('../utils/cryptoPayload');

/**
 * Vault Service
 * Issue #679: Orchestrates Zero-Knowledge encryption operations.
 */
class VaultService {
    /**
     * Initialize a new vault for a user
     */
    async initializeVault(userId, vaultSecret) {
        const existing = await VaultMetadata.findOne({ userId });
        if (existing) throw new Error('Vault already initialized');

        const salt = cryptoPayload.generateSalt();
        const metadata = new VaultMetadata({
            userId,
            salt,
            isEncryptedVaultEnabled: true
        });

        await metadata.save();
        return { success: true, message: 'Vault initialized' };
    }

    /**
     * Get the derived key for a user (Requires secret input)
     */
    async _getDerivedKey(userId, vaultSecret) {
        const metadata = await VaultMetadata.findOne({ userId });
        if (!metadata || !metadata.isEncryptedVaultEnabled) return null;

        return await cryptoPayload.deriveKey(vaultSecret, metadata.salt);
    }

    /**
     * Encrypt sensitive transaction fields
     */
    async encryptData(userId, vaultSecret, plainText) {
        const key = await this._getDerivedKey(userId, vaultSecret);
        if (!key) return plainText; // Fallback if vault not enabled or secret wrong

        return cryptoPayload.encrypt(plainText, key);
    }

    /**
     * Decrypt sensitive transaction fields
     */
    async decryptData(userId, vaultSecret, cipherText) {
        if (!cipherText || !cipherText.includes(':')) return cipherText;

        const key = await this._getDerivedKey(userId, vaultSecret);
        if (!key) return '[ENCRYPTED]';

        try {
            return cryptoPayload.decrypt(cipherText, key);
        } catch (err) {
            return '[INVALID_SECRET]';
        }
    }
}

module.exports = new VaultService();
