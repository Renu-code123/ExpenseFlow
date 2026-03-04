const assert = require('assert');
const auditHash = require('../utils/auditHash');
const merkleMath = require('../utils/merkleMath');

/**
 * Audit Traceability & Chain Integrity Tests
 * Issue #782: Verifying that tampering triggers a "Chain Break" or signature failure.
 * Note: These are logic-level integrity tests.
 */
describe('Ledger Integrity & Forensic Chain (Unit)', () => {

    it('should detect tampering in event payloads (Hash Mismatch)', () => {
        const prevHash = 'abc';
        const payload = { amount: 100 };
        const originalHash = auditHash.calculateHash(prevHash, payload);

        // Tamper with payload
        const tamperedPayload = { amount: 101 };
        const newHash = auditHash.calculateHash(prevHash, tamperedPayload);

        assert.notStrictEqual(originalHash, newHash);
    });

    it('should detect broken chains via Merkle Roots', () => {
        const hashes = ['h1', 'h2', 'h3', 'h4'];
        const originalRoot = merkleMath.buildRoot(hashes);

        // Tamper with one hash
        const tamperedHashes = ['h1', 'h_TAMPERED', 'h3', 'h4'];
        const tamperedRoot = merkleMath.buildRoot(tamperedHashes);

        assert.notStrictEqual(originalRoot, tamperedRoot);
    });

    it('should verify Merkle proofs for forensic audits', () => {
        const hashes = ['a', 'b', 'c', 'd'];
        const root = merkleMath.buildRoot(hashes);
        const index = 1;
        const proof = merkleMath.generateProof(hashes, index);

        const isValid = merkleMath.verifyProof(hashes[index], proof, root);
        assert.strictEqual(isValid, true);
    });
});
