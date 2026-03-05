const SnarkMath = require('../utils/snarkMath');
const ZKAttestation = require('../models/ZKAttestation');
const logger = require('../utils/structuredLogger');

/**
 * ZKProofGenerator Service
 * Issue #867: Core logic for generating SNARK proofs of compliance for expenses.
 */
class ZKProofGenerator {
    /**
     * Generate a proof that a transaction complies with a specific policy.
     */
    async generateComplianceProof(transaction, policy) {
        logger.info(`[ZKProver] Generating compliance proof for TX: ${transaction._id}`);

        let proofResult;

        if (policy.type === 'AMOUNT_LIMIT') {
            const limit = policy.params.maxAmount || 100;
            proofResult = SnarkMath.generateRangeProof(transaction.amount, 0, limit);
        } else if (policy.type === 'MERCHANT_WHITELIST') {
            const whitelist = policy.params.approvedMerchants || [];
            proofResult = SnarkMath.generateMembershipProof(transaction.merchant, whitelist);
        } else {
            throw new Error(`Unsupported policy type for ZK proof: ${policy.type}`);
        }

        // Create the attestation record
        const attestation = await ZKAttestation.create({
            transactionId: transaction._id,
            workspaceId: transaction.workspaceId,
            verificationKeyId: 'default_vk', // TODO: Use actual verification key ID
            publicSignals: proofResult.publicSignals,
            proofHash: require('crypto').createHash('sha256').update(JSON.stringify(proofResult)).digest('hex'),
            complianceRoot: transaction.currentHash || '0x0', // Anchor to transaction state
            proofStatus: 'generated'
        });

        return attestation;
    }

    /**
     * Batch proof generation for multiple transactions.
     */
    async batchGenerate(transactions, policies) {
        const results = [];
        for (const tx of transactions) {
            // Find applicable policy
            const policy = policies.find(p => p.workspaceId.toString() === tx.workspaceId.toString());
            if (policy) {
                try {
                    const proof = await this.generateComplianceProof(tx, policy);
                    results.push(proof);
                } catch (err) {
                    logger.error(`[ZKProver] Batch failed for TX: ${tx._id}`, { error: err.message });
                }
            }
        }
        return results;
    }
}

module.exports = new ZKProofGenerator();
