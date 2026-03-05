const vaultService = require('../services/vaultService');

/**
 * Encryption Interceptor Middleware
 * Issue #679: Automatically encrypts/decrypts fields based on user-provided secret.
 */
const encryptionInterceptor = async (req, res, next) => {
    const vaultSecret = req.headers['x-vault-secret'];
    const ENCRYPT_FIELDS = ['description', 'merchant', 'notes'];

    // 1. Process Input (Encryption)
    if (vaultSecret && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        for (const field of ENCRYPT_FIELDS) {
            if (req.body[field]) {
                try {
                    req.body[field] = await vaultService.encryptData(req.user._id, vaultSecret, req.body[field]);

                    // Track which fields are encrypted
                    if (!req.body.encryptedFields) req.body.encryptedFields = [];
                    if (!req.body.encryptedFields.includes(field)) {
                        req.body.encryptedFields.push(field);
                    }
                } catch (err) {
                    console.error(`[EncryptionInterceptor] Failed to encrypt ${field}:`, err);
                }
            }
        }
    }

    // 2. Process Output (Decryption)
    const originalJson = res.json;
    res.json = async function (data) {
        if (data && data.success && data.data) {
            const vaultSecretOut = req.headers['x-vault-secret'];

            // Function to recursively decrypt objects
            const decryptRecursive = async (item) => {
                if (!item || typeof item !== 'object') return;

                if (item.encryptedFields && Array.isArray(item.encryptedFields)) {
                    for (const field of item.encryptedFields) {
                        if (item[field]) {
                            item[field] = await vaultService.decryptData(req.user._id, vaultSecretOut, item[field]);
                        }
                    }
                }

                // Recurse into nested objects/arrays
                for (const value of Object.values(item)) {
                    if (Array.isArray(item)) {
                        // handled by loop
                    } else if (typeof value === 'object') {
                        await decryptRecursive(value);
                    }
                }
            };

            const items = Array.isArray(data.data) ? data.data : [data.data];
            for (const item of items) {
                await decryptRecursive(item);
            }
        }
        return originalJson.call(this, data);
    };

    next();
};

module.exports = encryptionInterceptor;
