const cron = require('node-cron');
const FinancialEvent = require('../models/FinancialEvent');

/**
 * Event Archiver Job
 * Issue #680: Prunes or archives old event logs to maintain main system performance.
 */
class EventArchiver {
    constructor() {
        this.name = 'EventArchiver';
    }

    /**
     * Start the archival worker
     */
    start() {
        console.log(`[${this.name}] Initializing immutable state archiver...`);

        // Run every 1st of the month at 2:00 AM
        cron.schedule('0 2 1 * *', async () => {
            try {
                console.log(`[${this.name}] Starting monthly archival cycle...`);

                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

                // In a production system, we'd move these to S3/Cold Storage
                // For this implementation, we mark them as archived
                const result = await FinancialEvent.updateMany(
                    { 'metadata.timestamp': { $lt: ninetyDaysAgo } },
                    { $set: { isArchived: true } }
                );

                console.log(`[${this.name}] Archived ${result.modifiedCount} legacy events.`);
            } catch (error) {
                console.error(`[${this.name}] Archival error:`, error);
            }
        });
    }
}

module.exports = new EventArchiver();
