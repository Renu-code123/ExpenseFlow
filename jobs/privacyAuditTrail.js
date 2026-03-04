const cron = require('node-cron');
const PrivacyBridge = require('../models/PrivacyBridge');
const Transaction = require('../models/Transaction');
const logger = require('../utils/structuredLogger');

/**
 * Privacy Audit Trail Job
 * Issue #844: Verifying that no individual record can be reconstructed from aggregates.
 * Ensures that the privacy budget (epsilon) is managed and resets periodically.
 */
class PrivacyAuditTrail {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run nightly at 2 AM to audit privacy budgets and reset consumed epsilon
        cron.schedule('0 2 * * *', async () => {
            if (this.isRunning) return;
            this.isRunning = true;

            try {
                await this.auditAndResetBudgets();
            } catch (err) {
                logger.error('[PrivacyAuditTrail] Audit loop failed', { error: err.message });
            } finally {
                this.isRunning = false;
            }
        });
        console.log('✓ Privacy Audit Trail scheduled');
    }

    async auditAndResetBudgets() {
        // Reset budgets for workspaces every 24h to allow fresh contributions
        // In a strict DQ system, this would be a decay function instead of a reset
        const result = await PrivacyBridge.updateMany(
            { isActive: true },
            { $set: { privacyBudgetUsed: 0, lastRefreshAt: new Date() } }
        );

        logger.info(`[PrivacyAuditTrail] Reset privacy budgets for ${result.modifiedCount} workspaces.`);

        // Integrity Check: Verify that benchmarking opt-in matches actual usage
        const anomalies = await Transaction.find({
            'privacyMetadata.isBenchmarked': true,
            'privacyMetadata.privacyEpsilonConsumed': { $eq: 0 }
        }).limit(100);

        if (anomalies.length > 0) {
            logger.error('[PrivacyAuditTrail] Found transactions marked as benchmarked but with zero epsilon record.');
        }
    }
}

module.exports = new PrivacyAuditTrail();
