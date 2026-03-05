const crypto = require('crypto');
const KeyNode = require('../models/KeyNode');
const KeyDerivation = require('../utils/keyDerivation');
const logger = require('../utils/structuredLogger');

// Internal cache for decrypted tenant keys (should use a distributed secure cache in prod like Hashicorp Vault)
const keyCache = new Map();

/**
 * Cryptographic Vault Service
 * Issue #770: AES-256-GCM interface for Field-Level Encryption.
 * Manages fetching, decrypting, and applying tenant-specific keys.
 */
class CryptVault {
    /**
     * Get or generate a tenant's raw encryption key
     */
    async getTenantKey(tenantId) {
        if (!tenantId) throw new Error('Tenant ID required for vault access');

        const tid = String(tenantId);
        if (keyCache.has(tid)) {
            return keyCache.get(tid); // Raw Buffer
        }

        let keyDoc = await KeyNode.findOne({ tenantId });

        const masterKey = KeyDerivation.getMasterKey();

        if (!keyDoc) {
            // Generate a new tenant key and store it encrypted
            const rawTenantKey = KeyDerivation.generateTenantKey();
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);

            let encrypted = cipher.update(rawTenantKey, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag().toString('hex');

            keyDoc = await KeyNode.create({
                tenantId,
                encryptedKey: encrypted,
                iv: iv.toString('hex'),
                authTag: authTag,
                algorithm: 'aes-256-gcm'
            });

            keyCache.set(tid, rawTenantKey);
            return rawTenantKey;
        }

        // Decrypt the existing tenant key
        try {
            const decipher = crypto.createDecipheriv(
                keyDoc.algorithm,
                masterKey,
                Buffer.from(keyDoc.iv, 'hex')
            );
            decipher.setAuthTag(Buffer.from(keyDoc.authTag, 'hex'));

            let rawTenantKey = decipher.update(keyDoc.encryptedKey, 'hex', 'utf8');
            rawTenantKey += decipher.final('utf8');

            const keyBuffer = Buffer.from(rawTenantKey, 'utf8');
            keyCache.set(tid, keyBuffer);
            return keyBuffer;
        } catch (error) {
            logger.error('CRITICAL: Failed to decrypt tenant key. Data may be lost!', { tenantId });
            throw new Error('Vault access failed');
        }
    }

    /**
     * Encrypt a string value
     */
    async encrypt(value, tenantId) {
        if (!value) return value;

        try {
            const key = await this.getTenantKey(tenantId);
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

            let encrypted = cipher.update(Buffer.from(value, 'utf8'));
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();

            // Return custom format string
            return `vault:v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
        } catch (e) {
            console.error('Encryption failed', e);
            throw e;
        }
    }

    /**
     * Decrypt a vault string
     */
    async decrypt(encryptedStr, tenantId) {
        if (!encryptedStr || !encryptedStr.startsWith('vault:v1:')) return encryptedStr;

        try {
            const key = await this.getTenantKey(tenantId);
            const [, , ivB64, tagB64, payloadB64] = encryptedStr.split(':');

            const iv = Buffer.from(ivB64, 'base64');
            const authTag = Buffer.from(tagB64, 'base64');
            const payload = Buffer.from(payloadB64, 'base64');

            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(payload);
            decrypted = Buffer.concat([decrypted, decipher.final()]);

            return decrypted.toString('utf8');
        } catch (e) {
            logger.error('Decryption failed for payload', { tenantId });
            // Return masked version on failure rather than crashing or revealing raw
            return '********';
        }
    }
}

module.exports = new CryptVault();
