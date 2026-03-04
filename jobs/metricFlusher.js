const cron = require('node-cron');
const TelemetryMetric = require('../models/TelemetryMetric');
const logger = require('../utils/structuredLogger');

/**
 * Metric Flusher Job
 * Issue #755: Moving telemetry data to long-term storage or pruning stale logs.
 * Keeps the hot-storage database lean while preserving forensic history.
 */
class MetricFlusher {
    start() {
        // Run daily at 4 AM
        cron.schedule('0 4 * * *', async () => {
            console.log('[MetricFlusher] Starting telemetry aggregation and pruning...');
            try {
                const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

                // Prune old low-severity performance metrics
                const result = await TelemetryMetric.deleteMany({
                    type: 'performance',
                    severity: 'info',
                    timestamp: { $lt: ninetyDaysAgo }
                });

                logger.info('[MetricFlusher] Pruning complete', {
                    removedCount: result.deletedCount
                });

                // In a production scenario, we would stream these to S3/Cold Storage here
            } catch (error) {
                logger.error('[MetricFlusher] Job failed', { error: error.message });
            }
        });
    }
}

module.exports = new MetricFlusher();
