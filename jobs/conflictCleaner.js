const cron = require('node-cron');
const SyncConflict = require('../models/SyncConflict');

/**
 * Conflict Cleaner Job
 * Issue #705: Periodically cleans up resolved or old conflict logs.
 */
class ConflictCleaner {
    constructor() {
        this.name = 'ConflictCleaner';
    }

    /**
     * Start the cleaner worker
     */
    start() {
        console.log(`[${this.name}] Initializing conflict maintenance worker...`);

        // Run every Sunday at 4:00 AM
        cron.schedule('0 4 * * 0', async () => {
            try {
                console.log(`[${this.name}] Starting conflict cleanup cycle...`);

                // 1. Delete resolved conflicts older than 30 days
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                const resolvedResult = await SyncConflict.deleteMany({
                    status: 'resolved',
                    resolvedAt: { $lt: thirtyDaysAgo }
                });

                // 2. Identify stale open conflicts (older than 90 days) and mark as ignored
                const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
                const ignoredResult = await SyncConflict.updateMany(
                    {
                        status: 'open',
                        createdAt: { $lt: ninetyDaysAgo }
                    },
                    {
                        status: 'ignored',
                        resolutionStrategy: 'auto_merge' // Flagged as auto-discarded
                    }
                );

                console.log(`[${this.name}] Maintenance complete. 
                    - Purged ${resolvedResult.deletedCount} old resolved conflicts.
                    - Ignored ${ignoredResult.modifiedCount} stale open conflicts.`);

            } catch (error) {
                console.error(`[${this.name}] Critical maintenance error:`, error);
            }
        });
    }
}

module.exports = new ConflictCleaner();
