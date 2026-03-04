const cron = require('node-cron');
const SearchIndex = require('../models/SearchIndex');
const logger = require('../utils/structuredLogger');

/**
 * Search Index Pruner
 * Issue #756: Background clean-up of stale index entries.
 * Ensures the search index doesn't grow indefinitely with orphaned records.
 */
class SearchPruner {
    start() {
        // Run every Sunday at 3 AM
        cron.schedule('0 3 * * 0', async () => {
            console.log('[SearchPruner] Starting index cleanup...');
            try {
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

                // 1. Remove entries for deleted entities (In a real system, we'd sync with main DB)
                // For now, we remove very old index entries that haven't been updated
                const result = await SearchIndex.deleteMany({
                    lastIndexedAt: { $lt: thirtyDaysAgo }
                });

                logger.info('[SearchPruner] Cleaned up search index', {
                    removedCount: result.deletedCount
                });
            } catch (error) {
                logger.error('[SearchPruner] Cleanup failed', { error: error.message });
            }
        });
    }
}

module.exports = new SearchPruner();
