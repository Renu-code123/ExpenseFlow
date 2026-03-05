const crypto = require('crypto');

/**
 * Crypto Payload Utility
 * Issue #679: Handles AES-256-GCM encryption/decryption and key derivation.
 */
class CryptoPayload {
    constructor() {
        this.ALGORITHM = 'aes-256-gcm';
        this.IV_LENGTH = 16;
        this.SALT_LENGTH = 64;
        this.TAG_LENGTH = 16;
    }

    /**
     * Derive a strong key from a user password/secret
     */
    async deriveKey(password, salt) {
        return new Promise((resolve, reject) => {
            crypto.pbkdf2(password, salt, 100000, 32, 'sha512', (err, key) => {
                if (err) reject(err);
                resolve(key);
            });
        });
    }

    /**
     * Encrypt a data string using AES-256-GCM
     */
    encrypt(data, key) {
        const iv = crypto.randomBytes(this.IV_LENGTH);
        const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const tag = cipher.getAuthTag().toString('hex');

        // Return encoded format: iv:tag:payload
        return `${iv.toString('hex')}:${tag}:${encrypted}`;
    }

    /**
     * Decrypt a data string using AES-256-GCM
     */
    decrypt(encryptedData, key) {
        const [ivHex, tagHex, payloadHex] = encryptedData.split(':');

        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);

        decipher.setAuthTag(tag);

        let decrypted = decipher.update(payloadHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    /**
     * Generate a random salt
     */
    generateSalt() {
        return crypto.randomBytes(this.SALT_LENGTH).toString('hex');
    }
}

module.exports = new CryptoPayload();
