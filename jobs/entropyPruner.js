const cron = require('node-cron');
const CausalVector = require('../models/CausalVector');
const SyncLog = require('../models/SyncLog');
const logger = require('../utils/structuredLogger');

/**
 * Entropy Pruner Job
 * Issue #868: Cleaning up resolved conflict logs and stale logical clocks.
 * Ensures the Distributed Consensus Fabric doesn't accumulate excessive metadata.
 */
class EntropyPruner {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run daily at 1 AM
        cron.schedule('0 1 * * *', async () => {
            if (this.isRunning) return;
            this.isRunning = true;

            try {
                await this.pruneStaleMetadata();
            } catch (err) {
                logger.error('[EntropyPruner] Pruning cycle failed', { error: err.message });
            } finally {
                this.isRunning = false;
            }
        });
        console.log('✓ Entropy Pruner scheduled');
    }

    async pruneStaleMetadata() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // 1. Prune resolved SyncLogs
        const syncResult = await SyncLog.deleteMany({
            status: 'resolved',
            updatedAt: { $lte: thirtyDaysAgo }
        });
        logger.info(`[EntropyPruner] Pruned ${syncResult.deletedCount} resolved sync logs.`);

        // 2. Prune old CausalVectors that haven't been touched
        const vectorResult = await CausalVector.deleteMany({
            lastUpdated: { $lte: thirtyDaysAgo }
        });
        logger.info(`[EntropyPruner] Pruned ${vectorResult.deletedCount} stale causal vectors.`);
    }
}

module.exports = new EntropyPruner();
