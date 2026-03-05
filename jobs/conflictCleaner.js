const SyncConflict = require('../models/SyncConflict');
const jobOrchestrator = require('../services/jobOrchestrator');
const logger = require('../utils/structuredLogger');

/**
 * Conflict Cleaner Job
 * Issue #705 & #719: Refactored for Resilient Orchestration.
 */
class ConflictCleaner {
    constructor() {
        this.name = 'CONFLICT_CLEANER';
    }

    /**
     * Now hooks into the resilient orchestrator
     */
    start() {
        jobOrchestrator.register(
            this.name,
            '0 4 * * 0', // Every Sunday at 4:00 AM
            this.executeCleanup.bind(this),
            { retryLimit: 3, baseDelay: 10000 }
        );
    }

    async executeCleanup() {
        logger.info(`[${this.name}] Starting maintenance cycle...`);

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
                resolutionStrategy: 'auto_merge'
            }
        );

        logger.info(`[${this.name}] Cleanup complete`, {
            purgedCount: resolvedResult.deletedCount,
            ignoredCount: ignoredResult.modifiedCount
        });

        return Promise.resolve();
    }
}

module.exports = new ConflictCleaner();
