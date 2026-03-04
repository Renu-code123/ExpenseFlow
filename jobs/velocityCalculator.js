const cron = require('node-cron');
const Workspace = require('../models/Workspace');
const expenseRepository = require('../repositories/expenseRepository');
const mathCompliance = require('../utils/mathCompliance');
const complianceOrchestrator = require('../services/complianceOrchestrator');
const logger = require('../utils/structuredLogger');

/**
 * Velocity Calculator
 * Issue #780: Real-time analysis of tenant spend velocity.
 */
class VelocityCalculator {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run every 10 minutes to analyze spending rates
        cron.schedule('*/10 * * * *', async () => {
            if (this.isRunning) return;
            this.isRunning = true;

            try {
                await this.sweepVelocities();
            } catch (err) {
                logger.error('[VelocityCalculator] Loop failed', { error: err.message });
            } finally {
                this.isRunning = false;
            }
        });
        console.log('✓ Velocity Calculator scheduled');
    }

    async sweepVelocities() {
        const workspaces = await Workspace.find({ status: 'active' });

        for (const workspace of workspaces) {
            // Calculate spend in last 24h vs historical daily avg
            const now = new Date();
            const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

            const recentSpend = await expenseRepository.aggregate([
                { $match: { workspace: workspace._id, date: { $gte: oneDayAgo }, type: 'expense' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);

            const currentVelocity = recentSpend[0] ? recentSpend[0].total : 0;

            // Context injection for Predicate Engine
            const contextData = {
                metrics: {
                    dailyVelocity: currentVelocity
                }
            };

            // Programmatically trigger orchestration check with new statistical context
            await complianceOrchestrator.evaluate(
                workspace._id,
                'WORKSPACE',
                { event: 'VELOCITY_SWEEP' },
                contextData
            );
        }
    }
}

module.exports = new VelocityCalculator();
