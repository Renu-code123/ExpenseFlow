const assert = require('assert');
const merkleMath = require('../utils/merkleMath');

/**
 * Merkle Logic Tests
 * Issue #782: Validating Merkle Tree construction and proof verification.
 */
describe('Merkle Proof System (Pure Logic)', () => {

    it('should build a consistent root from list of hashes', () => {
        const hashes = ['h1', 'h2', 'h3', 'h4'];
        const root = merkleMath.buildRoot(hashes);
        assert.ok(root);
        assert.strictEqual(root.length, 64); // SHA-256 hex
    });

    it('should generate and verify a valid proof', () => {
        const hashes = ['a', 'b', 'c', 'd', 'e'];
        const root = merkleMath.buildRoot(hashes);

        const index = 2; // 'c'
        const proof = merkleMath.generateProof(hashes, index);

        const isValid = merkleMath.verifyProof(hashes[index], proof, root);
        assert.strictEqual(isValid, true);
    });

    it('should reject an invalid proof', () => {
        const hashes = ['a', 'b', 'c', 'd'];
        const root = merkleMath.buildRoot(hashes);

        const proof = merkleMath.generateProof(hashes, 0);
        const isValid = merkleMath.verifyProof('WRONG', proof, root);

        assert.strictEqual(isValid, false);
    });
});
