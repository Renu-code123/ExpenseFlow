const cron = require('node-cron');
const SyncConflict = require('../models/SyncConflict');
const logger = require('../utils/structuredLogger');

/**
 * Conflict Pruner Job
 * Issue #730: Automatically removes old resolved conflicts to save storage.
 */
class ConflictPruner {
    start() {
        // Run every day at 3 AM
        cron.schedule('0 3 * * *', async () => {
            logger.info('[ConflictPruner] Starting cleanup of resolved conflicts...');

            try {
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

                const result = await SyncConflict.deleteMany({
                    status: 'resolved',
                    resolvedAt: { $lt: thirtyDaysAgo }
                });

                logger.info(`[ConflictPruner] Purged ${result.deletedCount} old conflict records.`);
            } catch (err) {
                logger.error('[ConflictPruner] Cleanup failure', { error: err.message });
            }
        });
    }
}

module.exports = new ConflictPruner();
