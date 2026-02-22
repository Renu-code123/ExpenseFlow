const crypto = require('crypto');

/**
 * Audit Hash Utility
 * Issue #738: Provides cryptographic chaining for event-sourced ledger.
 * Ensures immutability through SHA-256 hashing and HMAC signatures.
 */

class AuditHash {
    constructor() {
        this.secret = process.env.LEDGER_SECRET || 'ledger-immutable-secret-2026';
    }

    /**
     * Compute hash of an event combined with previous hash
     */
    calculateHash(prevHash, payload) {
        const data = prevHash + JSON.stringify(payload);
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Create a signature for the hash to prevent tampering
     */
    sign(hash) {
        return crypto.createHmac('sha256', this.secret).update(hash).digest('hex');
    }

    /**
     * Verify the signature of a hash
     */
    verify(hash, signature) {
        const expected = this.sign(hash);
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    }
}

module.exports = new AuditHash();
