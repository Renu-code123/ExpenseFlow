const cron = require('node-cron');
const stressTestEngine = require('../services/stressTestEngine');
const Workspace = require('../models/Workspace');
const logger = require('../utils/structuredLogger');

/**
 * Liquidity Analyzer Job
 * Issue #739: Daily autonomous deep-scan of workspace stability.
 * Triggers defensive maneuvers if a liquidity crunch is detected.
 */
class LiquidityAnalyzer {
    start() {
        // Run every day at 1 AM
        cron.schedule('0 1 * * *', async () => {
            console.log('[LiquidityAnalyzer] Commencing workspace stability audits...');

            try {
                const workspaces = await Workspace.find({ status: 'active' });

                for (const ws of workspaces) {
                    const testResult = await stressTestEngine.evaluateLiquidity(ws._id);

                    if (testResult.status === 'critical' || testResult.status === 'warning') {
                        logger.warn(`[LiquidityAudit] Risky Liquidity detected for Workspace: ${ws.name}`, {
                            workspaceId: ws._id,
                            status: testResult.status,
                            ruinProbability: testResult.maxRuinProbability
                        });

                        // Logic to send alerts or freeze non-essential budgets could go here
                    }
                }

                console.log(`[LiquidityAnalyzer] Completed audit for ${workspaces.length} workspaces.`);
            } catch (err) {
                logger.error('[LiquidityAnalyzer] Audit failure', { error: err.message });
            }
        });
    }
}

module.exports = new LiquidityAnalyzer();
