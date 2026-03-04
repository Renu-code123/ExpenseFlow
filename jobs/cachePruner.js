const cron = require('node-cron');
const CacheMap = require('../models/CacheMap');
const multiTierCache = require('../utils/multiTierCache');
const logger = require('../utils/structuredLogger');

/**
 * Cache Pruner Job
 * Issue #781: Background cleaning of orphaned or stale epoch fragments
 */
class CachePruner {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run every minute for fast stale cleanups (L2 sync simulation)
        cron.schedule('*/5 * * * *', async () => {
            if (this.isRunning) return;
            this.isRunning = true;

            try {
                await this.pruneStaleNodes();
            } catch (err) {
                logger.error('[CachePruner] Run failed', { error: err.message });
            } finally {
                this.isRunning = false;
            }
        });
        console.log('✓ Cache Pruner scheduled');
    }

    async pruneStaleNodes() {
        // Remove expired tracker nodes from the DB
        const result = await CacheMap.deleteMany({
            expiresAt: { $lt: new Date() }
        });

        if (result.deletedCount > 0) {
            logger.info(`[CachePruner] GC collected ${result.deletedCount} orphaned cache fragments.`);
        }

        // Let MultiTierCache self-prune its local Map when hit, 
        // but we could also sweep it here for memory safety.
    }
}

module.exports = new CachePruner();
