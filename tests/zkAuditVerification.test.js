const assert = require('assert');
const SnarkMath = require('../utils/snarkMath');
const zkProofGenerator = require('../services/zkProofGenerator');
const mongoose = require('mongoose');

describe('ZK-Proof Compliance Attestation & Trustless Audit Prover (#867)', () => {

    describe('SnarkMath (Simulated Circuts)', () => {
        it('should generate and verify a valid Range Proof', () => {
            const val = 50;
            const min = 0;
            const max = 100;

            const proof = SnarkMath.generateRangeProof(val, min, max);
            assert.strictEqual(SnarkMath.verify(proof), true);
        });

        it('should generate a rejected proof for out-of-range values', () => {
            const val = 150;
            const min = 0;
            const max = 100;

            const proof = SnarkMath.generateRangeProof(val, min, max);
            assert.strictEqual(SnarkMath.verify(proof), false);
        });

        it('should verify a valid Membership Proof', () => {
            const merchant = 'Apple Store';
            const whitelist = ['Amazon', 'Apple Store', 'Google'];

            const proof = SnarkMath.generateMembershipProof(merchant, whitelist);
            assert.strictEqual(SnarkMath.verify(proof), true);
        });

        it('should fail verification for non-whitelisted merchants', () => {
            const merchant = 'Forbidden Shop';
            const whitelist = ['Amazon', 'Apple Store'];

            const proof = SnarkMath.generateMembershipProof(merchant, whitelist);
            assert.strictEqual(SnarkMath.verify(proof), false);
        });
    });

    describe('ZKProofGenerator Service', () => {
        it('should generate an attestation for a compliant transaction', async () => {
            const mockTx = {
                _id: new mongoose.Types.ObjectId(),
                workspaceId: new mongoose.Types.ObjectId(),
                amount: 45.00,
                merchant: 'Apple',
                currentHash: '0xabc123'
            };

            const policy = {
                type: 'AMOUNT_LIMIT',
                params: { maxAmount: 100 }
            };

            // Mocking ZKAttestation.create since DB won't be available in unit test
            const originalCreate = require('../models/ZKAttestation').create;
            require('../models/ZKAttestation').create = (data) => Promise.resolve({ ...data, _id: new mongoose.Types.ObjectId() });

            const attestation = await zkProofGenerator.generateComplianceProof(mockTx, policy);

            assert.strictEqual(attestation.proofType, 'RANGE_PROOF');
            assert.strictEqual(attestation.status, 'GENERATED');
            assert.strictEqual(SnarkMath.verify(attestation.proofData), true);

            // Restore
            require('../models/ZKAttestation').create = originalCreate;
        });
    });
});
