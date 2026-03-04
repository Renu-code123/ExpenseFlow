const TelemetryMetric = require('../models/TelemetryMetric');

/**
 * Telemetry Aggregator Service
 * Issue #755: Summarizing raw event streams into actionable metrics.
 * Provides insights into tenant performance and security health.
 */
class TelemetryAggregator {
    /**
     * Record a new telemetry event
     */
    async recordEvent(eventData) {
        try {
            return await TelemetryMetric.create(eventData);
        } catch (error) {
            console.error('[Telemetry] Failed to record event:', error.message);
        }
    }

    /**
     * Get aggregate latency statistics for a tenant
     */
    async getTenantStats(tenantId, durationInHours = 24) {
        const startTime = new Date(Date.now() - durationInHours * 60 * 60 * 1000);

        return await TelemetryMetric.aggregate([
            {
                $match: {
                    tenantId: mongoose.Types.ObjectId(tenantId),
                    type: 'performance',
                    timestamp: { $gte: startTime }
                }
            },
            {
                $group: {
                    _id: '$action',
                    avgLatency: { $avg: '$latencyMs' },
                    p95Latency: { $percentile: { input: '$latencyMs', p: [95], method: 'approximate' } },
                    requestCount: { $sum: 1 },
                    errorCount: {
                        $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] }
                    }
                }
            }
        ]);
    }

    /**
     * Get high-severity security events
     */
    async getSecurityAlerts(limit = 100) {
        return await TelemetryMetric.find({
            type: 'security',
            severity: { $in: ['high', 'critical'] }
        })
            .sort({ timestamp: -1 })
            .limit(limit)
            .populate('userId', 'name email');
    }
}

module.exports = new TelemetryAggregator();
