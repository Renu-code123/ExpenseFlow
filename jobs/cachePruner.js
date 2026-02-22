const cron = require('node-cron');
const cache = require('../utils/multiTierCache');

/**
 * Cache Pruner Job
 * Issue #741: Periodically sweeps the cache tiers to remove expired entries.
 * Ensures the in-memory L1 doesn't grow unbounded.
 */
class CachePruner {
    start() {
        // Run every 10 minutes
        cron.schedule('*/10 * * * *', async () => {
            console.log('[CachePruner] Starting cache sweep...');

            try {
                const now = Date.now();
                let prunedCount = 0;

                // Prune L1 (Map)
                for (const [key, entry] of cache.l1.entries()) {
                    if (entry.expiry <= now) {
                        cache.l1.delete(key);
                        prunedCount++;
                    }
                }

                // In a real Redis scenario, TTL is handled by Redis.
                // For our simulated L2, we prune it here.
                for (const key in cache.l2) {
                    if (cache.l2[key].expiry <= now) {
                        delete cache.l2[key];
                        prunedCount++;
                    }
                }

                console.log(`[CachePruner] Finished. Pruned ${prunedCount} entries.`);
            } catch (err) {
                console.error('[CachePruner] Error during sweep:', err);
            }
        });
    }
}

module.exports = new CachePruner();
