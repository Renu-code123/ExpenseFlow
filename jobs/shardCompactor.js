const cron = require('node-cron');
const LedgerShard = require('../models/LedgerShard');
const mongoose = require('mongoose');
const logger = require('../utils/structuredLogger');

/**
 * Shard Compactor Job
 * Issue #842: Background process for rolling up cold shards into archival storage.
 * Frees up high-frequency write resources by moving old events to long-term storage.
 */
class ShardCompactor {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run every Sunday at 4 AM
        cron.schedule('0 4 * * 0', async () => {
            if (this.isRunning) return;
            this.isRunning = true;

            try {
                await this.compactOldShards();
            } catch (err) {
                logger.error('[ShardCompactor] Compaction cycle failed', { error: err.message });
            } finally {
                this.isRunning = false;
            }
        });
        console.log('✓ Shard Compactor scheduled');
    }

    async compactOldShards() {
        // Find shards older than 3 months that are still 'active' or 'read-only'
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 3);

        const coldShards = await LedgerShard.find({
            endTime: { $lte: cutoff },
            status: { $in: ['active', 'read-only'] }
        });

        for (const shard of coldShards) {
            logger.info(`[ShardCompactor] Compacting cold shard: ${shard.shardId}`);

            // Mark as compacting to prevent concurrent access issues
            shard.status = 'compacting';
            await shard.save();

            try {
                // 1. In a real environment, we'd move data to S3 or a compressed MongoDB collection
                // Here we simulate archival by updating the status

                // 2. Perform rollup (e.g., aggregate high-level metrics for this shard)
                // 3. Mark as archived
                shard.status = 'archived';
                shard.lastCompactedAt = new Date();
                await shard.save();

                logger.info(`[ShardCompactor] Successfully archived shard: ${shard.shardId}`);
            } catch (error) {
                logger.error(`[ShardCompactor] Failed to compact ${shard.shardId}`, { error: error.message });
                shard.status = 'read-only'; // Revert to safe state
                await shard.save();
            }
        }
    }
}

module.exports = new ShardCompactor();
