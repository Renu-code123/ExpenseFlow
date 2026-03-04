const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const cryptVault = require('../services/cryptVault');

/**
 * Legacy Key Rotator and Encryptor
 * Issue #770: Background job to retroactively encrypt unencrypted PII strings
 * Finds plain text data in @sensitive fields and encrypts it using Vault.
 */
class KeyRotator {
    start() {
        // Run daily during non-peak hours
        cron.schedule('0 2 * * *', async () => {
            console.log('[KeyRotator] Starting retroactive encryption sweep...');
            try {
                // Find transactions with unencrypted sensitive fields
                const cursor = Transaction.find({
                    $or: [
                        { merchant: { $not: /^vault:v1:/, $ne: '' } },
                        { notes: { $not: /^vault:v1:/, $ne: '' } }
                    ]
                }).cursor();

                let encryptedCount = 0;

                for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
                    let isModified = false;
                    const tenantId = doc.workspace || doc.tenantId || 'global';

                    if (doc.merchant && !doc.merchant.startsWith('vault:')) {
                        doc.merchant = await cryptVault.encrypt(doc.merchant, tenantId);
                        isModified = true;
                    }

                    if (doc.notes && !doc.notes.startsWith('vault:')) {
                        doc.notes = await cryptVault.encrypt(doc.notes, tenantId);
                        isModified = true;
                    }

                    if (isModified) {
                        // Bypass normal hooks using update() to avoid nested processing
                        await Transaction.updateOne({ _id: doc._id }, {
                            $set: { merchant: doc.merchant, notes: doc.notes }
                        });
                        encryptedCount++;
                    }
                }

                console.log(`[KeyRotator] encrypted ${encryptedCount} legacy records.`);
            } catch (err) {
                console.error('[KeyRotator] sweeping failed:', err);
            }
        });
    }
}

module.exports = new KeyRotator();
