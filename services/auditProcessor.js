const AuditLog = require('../models/AuditLog');
const logger = require('../utils/structuredLogger');

/**
 * Audit Processor Service
 * Issue #731: Background worker to process high-volume audit data and perform anomaly detection.
 */
class AuditProcessor {
    /**
     * Periodically cleans up old audit logs (GDPR compliance)
     */
    async purgeOldLogs(days = 90) {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - days);

        try {
            const result = await AuditLog.deleteMany({
                timestamp: { $lt: threshold },
                severity: { $ne: 'critical' } // Never purge critical alerts automatically
            });

            logger.info(`[AuditProcessor] Purged ${result.deletedCount} old audit logs.`);
        } catch (err) {
            logger.error('[AuditProcessor] Purge failure:', err.message);
        }
    }

    /**
     * Aggregates audit data for security reporting
     */
    async getSecurityPulse(userId) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        return AuditLog.aggregate([
            {
                $match: {
                    performedBy: userId,
                    timestamp: { $gt: twentyFourHoursAgo }
                }
            },
            {
                $group: {
                    _id: "$action",
                    count: { $sum: 1 }
                }
            }
        ]);
    }

    /**
     * Forensic "Time Travel" - Reconstruct entity state at a specific point in time
     */
    async reconstructEntity(entityId, targetDate) {
        const diffEngine = require('../utils/diffEngine');

        // Fetch all update logs for this entity up to targetDate
        const logs = await AuditLog.find({
            entityId,
            action: 'update',
            timestamp: { $lte: targetDate }
        }).sort({ timestamp: 1 });

        if (logs.length === 0) return null;

        // Start with the state from the first log's 'before'
        const baseState = logs[0].changes.before;
        const diffs = logs.map(l => l.changes.diff);

        return diffEngine.reconstruct(baseState, diffs);
    }
}

module.exports = new AuditProcessor();
