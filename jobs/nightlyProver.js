const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const zkPrivacyOrchestrator = require('../services/zkPrivacyOrchestrator');
const logger = require('../utils/structuredLogger');

/**
 * NightlyProver Job
 * Issue #867: Batch proof-generation for all compliant transactions.
 * Processes transactions that haven't been proven yet to prepare for audits.
 */
class NightlyProver {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run nightly at 2 AM
        cron.schedule('0 2 * * *', async () => {
            if (this.isRunning) return;
            this.isRunning = true;

            try {
                await this.processUnprovenTransactions();
            } catch (err) {
                logger.error('[NightlyProver] Proof generation cycle failed', { error: err.message });
            } finally {
                this.isRunning = false;
            }
        });
        console.log('✓ Nightly ZK-Prover scheduled');
    }

    async processUnprovenTransactions() {
        logger.info('[NightlyProver] Starting batch ZK-proof generation...');

        // Find transactions from the last 24 hours that aren't proven
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const unproven = await Transaction.find({
            'zkAuditMetadata.isProven': false,
            createdAt: { $gte: yesterday },
            kind: 'expense'
        });

        logger.info(`[NightlyProver] Found ${unproven.length} transactions to prove.`);

        // Default "General Compliance" policy for batch proving
        const defaultPolicy = {
            type: 'AMOUNT_LIMIT',
            params: { maxAmount: 1000 }
        };

        for (const tx of unproven) {
            try {
                await zkPrivacyOrchestrator.generateTrustlessProof(tx._id, defaultPolicy);
            } catch (err) {
                logger.error(`[NightlyProver] Failed to prove TX: ${tx._id}`, { error: err.message });
            }
        }

        logger.info('[NightlyProver] Batch proof generation completed.');
    }
}

module.exports = new NightlyProver();
