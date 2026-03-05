const cron = require('node-cron');
const TaxNexus = require('../models/TaxNexus');
const nexusSwitchgear = require('../services/nexusSwitchgear');
const logger = require('../utils/structuredLogger');

/**
 * NexusUpdateJob
 * Issue #961: Syncing local nexus rules with global tax-law updates.
 * In production, this would call an external tax-regulation API.
 * Here we simulate fetching from a curated rate-sheet.
 */
class NexusUpdateJob {
    start() {
        // Run every Monday at 02:00 AM
        cron.schedule('0 2 * * 1', async () => {
            logger.info('[NexusUpdateJob] Starting scheduled tax nexus sync...');
            await this.syncGlobalRates();
        });
    }

    async syncGlobalRates() {
        // Simulated external data feed — in production, replace with real API call
        const globalTaxRates = [
            { jurisdictionCode: 'IN', jurisdictionName: 'India', taxType: 'GST', rate: 0.18 },
            { jurisdictionCode: 'DE', jurisdictionName: 'Germany', taxType: 'VAT', rate: 0.19 },
            { jurisdictionCode: 'GB', jurisdictionName: 'United Kingdom', taxType: 'VAT', rate: 0.20 },
            { jurisdictionCode: 'US-CA', jurisdictionName: 'California', taxType: 'SALES_TAX', rate: 0.0725 },
            { jurisdictionCode: 'AU', jurisdictionName: 'Australia', taxType: 'GST', rate: 0.10 },
            { jurisdictionCode: 'SG', jurisdictionName: 'Singapore', taxType: 'GST', rate: 0.09 }
        ];

        let updated = 0;
        for (const rate of globalTaxRates) {
            try {
                await TaxNexus.findOneAndUpdate(
                    { jurisdictionCode: rate.jurisdictionCode, taxType: rate.taxType },
                    { ...rate, source: 'GLOBAL_SYNC', isActive: true },
                    { upsert: true, new: true }
                );
                updated++;
            } catch (err) {
                logger.error(`[NexusUpdateJob] Failed to update ${rate.jurisdictionCode}:`, err);
            }
        }

        // Invalidate in-memory cache so next request picks up new rates
        nexusSwitchgear.invalidateCache();
        logger.info(`[NexusUpdateJob] ✓ Synced ${updated} tax nexus records.`);
    }
}

module.exports = new NexusUpdateJob();
