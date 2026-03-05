const cron = require('node-cron');
const TreasuryNode = require('../models/TreasuryNode');
const RebalancePlan = require('../models/RebalancePlan');
const YieldMath = require('../utils/yieldMath');
const logger = require('../utils/structuredLogger');

/**
 * Nightly Balancer Job
 * Issue #959: Optimization sweep for global capital allocation.
 * Sweeps excess cash from low-yield OPERATING nodes to high-yield RESERVE nodes.
 */
class NightlyBalancer {
    start() {
        // Run daily at 1:00 AM
        cron.schedule('0 1 * * *', async () => {
            logger.info('[NightlyBalancer] Starting capital optimization sweep...');
            await this.sweepExcessLiquidity();
        });
    }

    async sweepExcessLiquidity() {
        try {
            // Find all OPERATING nodes with balances above a safe threshold
            // For now, threshold is 2x target reserve ratio of daily spend (mocked as $10k)
            const SAFE_IDLE_THRESHOLD = 10000;

            const operatingNodes = await TreasuryNode.find({
                nodeType: 'OPERATING',
                balance: { $gt: SAFE_IDLE_THRESHOLD },
                status: 'ACTIVE'
            });

            for (const node of operatingNodes) {
                const reserve = await TreasuryNode.findOne({
                    workspaceId: node.workspaceId,
                    nodeType: 'RESERVE',
                    status: 'ACTIVE'
                });

                if (!reserve) continue;

                const excess = node.balance - SAFE_IDLE_THRESHOLD;

                // Calculate opportunity cost if we do NOT move it
                const yieldDiff = (reserve.yieldProfile?.annualRate || 0.04) - (node.yieldProfile?.annualRate || 0.01);
                const dailyGain = YieldMath.calculateOpportunityCost(excess, yieldDiff, 1);

                if (YieldMath.isRebalanceBeneficial(dailyGain, 5)) { // Move if gain > 2x of $5 fee
                    logger.info(`[NightlyBalancer] Sweeping ${excess} USD for Workspace ${node.workspaceId}`);

                    await RebalancePlan.create({
                        workspaceId: node.workspaceId,
                        sourceNodeId: node._id,
                        targetNodeId: reserve._id,
                        amount: excess,
                        triggerType: 'NIGHTLY_SWEEP',
                        yieldGainProjection: dailyGain,
                        executionWindow: {
                            start: new Date(),
                            end: new Date(Date.now() + 3600000) // 1h window
                        }
                    });
                }
            }
        } catch (err) {
            logger.error('[NightlyBalancer] Sweep failed:', err);
        }
    }
}

module.exports = new NightlyBalancer();
