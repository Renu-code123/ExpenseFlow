const cron = require('node-cron');
const SyncLog = require('../models/SyncLog');

/**
 * Sync Cleanup Job
 * Issue #660: Prunes old synchronization logs to maintain database performance
 */
class SyncCleanup {
    constructor() {
        this.name = 'SyncCleanup';
    }

    /**
     * Start the scheduled cleanup
     */
    start() {
        console.log(`[${this.name}] Initializing sync log maintenance...`);

        // Run every Sunday at 4:00 AM
        cron.schedule('0 4 * * 0', async () => {
            try {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const result = await SyncLog.deleteMany({
                    timestamp: { $lt: thirtyDaysAgo }
                });

                console.log(`[${this.name}] Successfully pruned ${result.deletedCount} old sync logs.`);
            } catch (error) {
                console.error(`[${this.name}] Critical error in sync cleanup:`, error);
            }
        });
    }
}

module.exports = new SyncCleanup();
