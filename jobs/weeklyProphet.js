const cron = require('node-cron');
const SimulationEngine = require('../services/simulationEngine');
const TreasuryNode = require('../models/TreasuryNode');
const logger = require('../utils/structuredLogger');

/**
 * WeeklyProphet Job
 * Issue #909: Re-calculating global liquidity forecasts based on new ledger events.
 * Runs every Sunday at midnight.
 */
class WeeklyProphetJob {
    start() {
        // Run every Sunday at 00:00
        cron.schedule('0 0 * * 0', async () => {
            logger.info('[WeeklyProphet] Starting weekly liquidity forecasting sweep...');
            await this.performGlobalForecast();
        });
    }

    async performGlobalForecast() {
        try {
            const activeNodes = await TreasuryNode.find({ status: 'ACTIVE' });

            for (const node of activeNodes) {
                try {
                    await SimulationEngine.runWorkspaceSimulation(node.workspaceId, node._id);
                    logger.info(`[WeeklyProphet] Forecast updated for workspace: ${node.workspaceId}`);
                } catch (err) {
                    logger.error(`[WeeklyProphet] Failed for node ${node._id}:`, err);
                }
            }
        } catch (error) {
            logger.error('[WeeklyProphet] Global sweep failed:', error);
        }
    }
}

module.exports = new WeeklyProphetJob();
