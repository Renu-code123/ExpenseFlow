const cron = require('node-cron');
const taxOptimizationEngine = require('../services/taxOptimizationEngine');
const Transaction = require('../models/Transaction');
const logger = require('../utils/structuredLogger');

/**
 * Tax Year-End Retainer Job
 * Issue #843: Nightly analysis of cumulative deductions vs projected revenue.
 * Notifies workspaces on potential tax-saving opportunities before the year ends.
 */
class TaxYearEndRetainer {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run nightly at 3 AM
        cron.schedule('0 3 * * *', async () => {
            if (this.isRunning) return;
            this.isRunning = true;

            try {
                await this.analyzeAllWorkspaces();
            } catch (err) {
                logger.error('[TaxYearEndRetainer] Retainer loop failed', { error: err.message });
            } finally {
                this.isRunning = false;
            }
        });
        console.log('✓ Tax Year-End Retainer scheduled');
    }

    async analyzeAllWorkspaces() {
        const currentYear = new Date().getFullYear();

        // Find distinct workspaces that have transactions this year
        const workspaces = await Transaction.distinct('workspace', {
            date: { $gte: new Date(currentYear, 0, 1) }
        });

        for (const workspaceId of workspaces) {
            if (!workspaceId) continue;

            // Calculate current total deductions estimated by the engine
            const aggregates = await Transaction.aggregate([
                { $match: { workspace: workspaceId, date: { $gte: new Date(currentYear, 0, 1) } } },
                { $group: { _id: null, totalDeducted: { $sum: '$taxMetadata.deductionEstimated' } } }
            ]);

            const totalDeducted = aggregates.length > 0 ? aggregates[0].totalDeducted : 0;

            // Assume a target deduction of 10% of revenue or a flat institutional threshold
            const target = 100000;

            const advice = await taxOptimizationEngine.getStrategicSpendAdvice(workspaceId, totalDeducted, target);

            if (advice.action === 'ACCELERATE_SPEND') {
                logger.info(`[TaxYearEndRetainer] Opportunity found for Workspace ${workspaceId}: ${advice.advice}`);
                // In production, this would trigger an email or in-app notification
            }
        }
    }
}

module.exports = new TaxYearEndRetainer();
