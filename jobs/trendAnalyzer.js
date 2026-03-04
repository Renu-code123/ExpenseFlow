const cron = require('node-cron');
const RiskProfile = require('../models/RiskProfile');
const anomalyService = require('../services/anomalyService');

/**
 * Trend Analyzer Background Job
 * Issue #645: Recalculates risk baselines and analyzes long-term spending patterns
 */
class TrendAnalyzer {
    constructor() {
        this.name = 'TrendAnalyzer';
    }

    /**
     * Start the scheduled baseline updates
     */
    start() {
        console.log(`[${this.name}] Initializing trend analysis jobs...`);

        // Run every night at 3:00 AM
        cron.schedule('0 3 * * *', async () => {
            try {
                console.log(`[${this.name}] Starting nightly baseline recalculations...`);

                // Find profiles that haven't been updated in 24h
                const staleProfiles = await RiskProfile.find({
                    lastAnalyzedAt: { $lt: new Date(Date.now() - 23 * 60 * 60 * 1000) }
                }).limit(100);

                for (const profile of staleProfiles) {
                    await anomalyService.updateUserBaselines(profile.user);
                }

                console.log(`[${this.name}] Recalculated baselines for ${staleProfiles.length} users.`);
            } catch (error) {
                console.error(`[${this.name}] Critical error in trend analyzer:`, error);
            }
        });
    }
}

module.exports = new TrendAnalyzer();
