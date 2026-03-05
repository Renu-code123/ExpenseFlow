const auditCorrection = require('../models/AuditCorrection');
const logger = require('../utils/structuredLogger');

/**
 * IntegrityMonitor Middleware
 * Issue #910: Real-time "Watchtower" that freezes accounts if out-of-sync thresholds are breached.
 * Blocks write operations if the discrepancy between ledger and bank exceeds certain limits.
 */
const integrityMonitor = async (req, res, next) => {
    const workspaceId = req.headers['x-workspace-id'] || req.user?.workspaceId;

    if (workspaceId && (req.method === 'POST' || req.method === 'PUT')) {
        try {
            // Check for recent unresolved "FAILED" or "HIGH_DISCREPANCY" corrections
            const highRiskCorrection = await auditCorrection.findOne({
                workspaceId,
                repairConfidence: { $lt: 0.5 },
                status: 'PROPOSED',
                createdAt: { $gte: new Date(Date.now() - 3600000) } // Last hour
            });

            if (highRiskCorrection) {
                logger.error(`[IntegrityMonitor] Blocking request for workspace ${workspaceId} due to high financial discrepancy.`);
                return res.status(403).json({
                    success: false,
                    error: 'FINANCIAL_INTEGRITY_VIOLATION',
                    message: 'Account temporarily frozen. High discrepancy detected between bank feeds and internal ledger. Manual review required.',
                    correctionId: highRiskCorrection._id
                });
            }
        } catch (err) {
            logger.error(`[IntegrityMonitor] Check failed`, { error: err.message });
        }
    }

    next();
};

module.exports = integrityMonitor;
