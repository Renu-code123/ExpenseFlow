const assert = require('assert');
const crypto = require('crypto');
const auditHash = require('../utils/auditHash');

/**
 * Audit Integrity Proof-of-Concept Tests
 * Issue #782: Validating that the hashing chain behaves as expected.
 */
describe('Ledger Hashing Chain (Integrity Logic)', () => {

    it('should generate consistent hashes for identical payloads', () => {
        const payload = { amount: 100, category: 'Food' };
        const h1 = auditHash.calculateHash('GENESIS', payload);
        const h2 = auditHash.calculateHash('GENESIS', payload);

        assert.strictEqual(h1, h2);
    });

    it('should break the chain if a previous hash is altered', () => {
        const p1 = { a: 1 };
        const p2 = { b: 2 };

        const h1 = auditHash.calculateHash('GENESIS', p1);
        const h2 = auditHash.calculateHash(h1, p2);

        // Tamper with h1
        const tamperedH1 = h1.replace('a', 'b');
        const h2Prime = auditHash.calculateHash(tamperedH1, p2);

        assert.notStrictEqual(h2, h2Prime);
    });

    it('should verify signatures correctly', () => {
        const data = 'some_hash_string';
        const signature = auditHash.sign(data);
        const isValid = auditHash.verify(data, signature);

        assert.strictEqual(isValid, true);
    });
});
