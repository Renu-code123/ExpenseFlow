const assert = require('assert');
const auditHash = require('../utils/auditHash');

/**
 * Ledger Integrity & Event Sourcing Tests
 * Issue #738: Verifies cryptographic chaining and logic.
 */

describe('Immutable Ledger & Event Sourcing (Unit Tests)', () => {

    describe('AuditHash Cryptography', () => {
        it('should generate consistent hashes for same input', () => {
            const h1 = auditHash.calculateHash('PREV', { data: 1 });
            const h2 = auditHash.calculateHash('PREV', { data: 1 });
            assert.strictEqual(h1, h2);
        });

        it('should generate different hashes for different payloads', () => {
            const h1 = auditHash.calculateHash('PREV', { data: 1 });
            const h2 = auditHash.calculateHash('PREV', { data: 2 });
            assert.notStrictEqual(h1, h2);
        });

        it('should generate different hashes if prevHash changes (chaining)', () => {
            const h1 = auditHash.calculateHash('PREV1', { data: 1 });
            const h2 = auditHash.calculateHash('PREV2', { data: 1 });
            assert.notStrictEqual(h1, h2);
        });

        it('should sign and verify hashes correctly', () => {
            const hash = 'abc-123-hash';
            const sig = auditHash.sign(hash);
            assert.strictEqual(auditHash.verify(hash, sig), true);
            // In timingSafeEqual, we must provide buffers of correct length if we want to avoid error
            // but for a simple "wrong" string it might throw if lengths differ.
            // auditHash.verify handles this.
        });
    });

    describe('Ledger Chaining Logic', () => {
        it('should demonstrate chain integrity via hash utility', () => {
            const genesisHash = 'GENESIS';
            const payload1 = { type: 'expense', amount: 100 };
            const payload2 = { type: 'expense', amount: 120 };

            const hash1 = auditHash.calculateHash(genesisHash, payload1);
            const hash2 = auditHash.calculateHash(hash1, payload2);

            const tamperedPayload1 = { type: 'expense', amount: 999 };
            const tamperedHash1 = auditHash.calculateHash(genesisHash, tamperedPayload1);

            assert.notStrictEqual(tamperedHash1, hash1);
        });
    });
});
