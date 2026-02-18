const cron = require('node-cron');
const subscriptionService = require('../services/subscriptionService');

/**
 * Subscription Renewal Worker
 * Issue #647: Scheduled background processing for renewals and trials
 */

class RenewalWorker {
    constructor() {
        this.name = 'RenewalWorker';
    }

    /**
     * Initialize scheduled jobs
     */
    start() {
        console.log(`[${this.name}] Initializing subscription lifecycle jobs...`);

        // Run every day at Midnight
        cron.schedule('0 0 * * *', async () => {
            try {
                console.log(`[${this.name}] Processing daily renewals...`);
                const results = await subscriptionService.processDueRenewals();
                console.log(`[${this.name}] Daily processing complete:`, results);
            } catch (error) {
                console.error(`[${this.name}] Critical error in renewal job:`, error);
            }
        });

        // Weekly Cleanup and Audit (Sundays at 2 AM)
        cron.schedule('0 2 * * 0', async () => {
            try {
                console.log(`[${this.name}] Starting weekly subscription audit...`);
                // In a real app, this could send a digest email to users
            } catch (error) {
                console.error(`[${this.name}] Critical error in audit job:`, error);
            }
        });
    }

    /**
     * Manual trigger for on-demand processing
     */
    async triggerProcessing() {
        return await subscriptionService.processDueRenewals();
    }
}

module.exports = new RenewalWorker();
