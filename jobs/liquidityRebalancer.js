const cron = require('node-cron');
const Workspace = require('../models/Workspace');
const rebalancingEngine = require('../services/rebalancingEngine');
const logger = require('../utils/structuredLogger');

/**
 * Liquidity Rebalancer Job
 * Issue #768: Nightly optimization of tenant fund placement.
 */
class LiquidityRebalancer {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run daily at 1 AM
        cron.schedule('0 1 * * *', async () => {
            if (this.isRunning) return;
            this.isRunning = true;

            try {
                await this.rebalanceAll();
            } catch (err) {
                logger.error('[LiquidityRebalancer] Run failed', { error: err.message });
            } finally {
                this.isRunning = false;
            }
        });
        console.log('✓ Liquidity Rebalancer scheduled');
    }

    async rebalanceAll() {
        // Fetch all active collaborative workspaces
        const workspaces = await Workspace.find({ status: 'active' });

        logger.info(`[LiquidityRebalancer] Rebalancing ${workspaces.length} workspaces`);

        for (const workspace of workspaces) {
            try {
                await rebalancingEngine.rebalanceWorkspace(workspace._id);
            } catch (err) {
                logger.error(`[LiquidityRebalancer] Failed for workspace ${workspace._id}`, { error: err.message });
            }
        }
    }
}

module.exports = new LiquidityRebalancer();
