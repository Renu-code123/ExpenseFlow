const Transaction = require('../models/Transaction');
const locationService = require('../services/locationService');

/**
 * Geocoding Background Job
 * Processes unprocessed transactions to add geospatial data
 * Issue #635
 */
class GeocodingJob {
    /**
     * Run a batch backfill of geocoding
     */
    async backfillGeocoding(limit = 100) {
        console.log(`[GeocodingJob] Starting backfill for up to ${limit} transactions...`);

        const unprocessed = await Transaction.find({
            locationSource: 'none',
            merchant: { $exists: true, $ne: '' }
        }).limit(limit);

        const results = {
            total: unprocessed.length,
            success: 0,
            failed: 0,
            details: []
        };

        for (const tx of unprocessed) {
            try {
                const res = await locationService.geocodeTransaction(tx._id);
                if (res.success) {
                    results.success++;
                } else {
                    // Tag as attempted so we don't keep retrying if not found
                    tx.locationSource = 'inferred';
                    await tx.save();
                    results.failed++;
                }
                results.details.push(res);
            } catch (error) {
                console.error(`[GeocodingJob] Error processing transaction ${tx._id}:`, error);
                results.failed++;
            }
        }

        console.log(`[GeocodingJob] Completed backfill. Success: ${results.success}, Failed: ${results.failed}`);
        return results;
    }
}

module.exports = new GeocodingJob();
