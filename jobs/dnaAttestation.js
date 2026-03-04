const cron = require('node-cron');
const MoneyLineage = require('../models/MoneyLineage');
const TreasuryNode = require('../models/TreasuryNode');
const logger = require('../utils/structuredLogger');

/**
 * DNA Attestation Job
 * Issue #866: Weekly audit to ensure fund integrity across sharded clusters.
 * Re-validates that the sum of fragments matches the node balance and that DNA constraints are intact.
 */
class DnaAttestation {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run weekly on Sundays at 3 AM
        cron.schedule('0 3 * * 0', async () => {
            if (this.isRunning) return;
            this.isRunning = true;

            try {
                await this.performGlobalAudit();
            } catch (err) {
                logger.error('[DnaAttestation] Global DNA audit failed', { error: err.message });
            } finally {
                this.isRunning = false;
            }
        });
        console.log('✓ DNA Attestation Job scheduled');
    }

    async performGlobalAudit() {
        logger.info('[DnaAttestation] Starting global genetic money audit...');

        const nodes = await TreasuryNode.find();

        for (const node of nodes) {
            const fragments = await MoneyLineage.find({ treasuryNodeId: node._id });
            const fragmentTotal = fragments.reduce((sum, f) => sum + f.amount, 0);

            // Verify total balance consistency
            if (Math.abs(fragmentTotal - node.balance) > 0.01) {
                logger.error(`[DnaAttestation] Balance mismatch in Node ${node._id}. Ledger: ${node.balance}, DNA-Sum: ${fragmentTotal}`);
                // Potential remediation: flag for forensic investigation
            }

            // Verify DNA-restricted buckets match fragments
            for (const bucket of node.dnaRestrictedBuckets) {
                const dnaSum = fragments
                    .filter(f => f.sourceDna === bucket.sourceDna)
                    .reduce((sum, f) => sum + f.amount, 0);

                if (Math.abs(dnaSum - bucket.amount) > 0.01) {
                    logger.warn(`[DnaAttestation] DNA Bucket mismatch in Node ${node._id} for ${bucket.sourceDna}. Bucket: ${bucket.amount}, Fragments: ${dnaSum}`);
                }
            }
        }

        logger.info('[DnaAttestation] Global genetic money audit completed.');
    }
}

module.exports = new DnaAttestation();
