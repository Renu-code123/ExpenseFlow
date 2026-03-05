const cron = require('node-cron');
const ReconciliationAgent = require('../services/reconciliationAgent');
const TreasuryNode = require('../models/TreasuryNode');
const logger = require('../utils/structuredLogger');

/**
 * NightlyReconciler Job
 * Issue #910: Batch audit of global ledger consistency.
 * Runs at 3 AM to reconcile all active treasury nodes with their bank feeds.
 */
class NightlyReconciler {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run every night at 3:00 AM
        cron.schedule('0 3 * * *', async () => {
            if (this.isRunning) return;
            this.isRunning = true;

            try {
                await this.performGlobalReconciliation();
            } catch (err) {
                logger.error('[NightlyReconciler] Global reconciliation failed', { error: err.message });
            } finally {
                this.isRunning = false;
            }
        });
        console.log('✓ Nightly Reconciler Job scheduled');
    }

    async performGlobalReconciliation() {
        logger.info('[NightlyReconciler] Starting global autonomous reconciliation...');

        const activeNodes = await TreasuryNode.find({ status: 'ACTIVE' });

        for (const node of activeNodes) {
            try {
                const result = await ReconciliationAgent.reconcileWorkspace(node.workspaceId, node._id);

                // Update node metadata
                node.metadata = {
                    ...node.metadata,
                    lastReconciledAt: new Date(),
                    lastAuditSummary: result
                };
                await node.save();

                if (result.healed > 0) {
                    logger.info(`[NightlyReconciler] Node ${node._id} self-healed: ${result.healed} discrepancies fixed.`);
                }
            } catch (err) {
                logger.error(`[NightlyReconciler] Failed for node ${node._id}`, { error: err.message });
            }
        }

        logger.info('[NightlyReconciler] Global reconciliation completed.');
    }
}

module.exports = new NightlyReconciler();
