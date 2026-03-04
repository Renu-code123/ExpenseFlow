const crypto = require('crypto');

/**
 * Hash Generator Utility
 * Issue #730: Ensures data integrity during multi-device synchronization.
 */

class HashGenerator {
    /**
     * Generates a deterministic SHA-256 hash of a transaction object
     */
    generateTransactionHash(transaction) {
        // We pick meaningful fields for the checksum to avoid minor noise (like Date object formatting)
        const payload = {
            amount: transaction.amount,
            currency: transaction.originalCurrency,
            description: transaction.description,
            date: transaction.date instanceof Date ? transaction.date.toISOString() : transaction.date,
            merchant: transaction.merchant,
            category: transaction.category ? transaction.category.toString() : null
        };

        const stringified = JSON.stringify(payload, Object.keys(payload).sort());
        return crypto.createHash('sha256').update(stringified).digest('hex');
    }

    /**
     * Verifies if a received object matches a stored checksum
     */
    verify(obj, hash) {
        return this.generateTransactionHash(obj) === hash;
    }
}

module.exports = new HashGenerator();
