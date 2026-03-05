const RebalancePlan = require('../models/RebalancePlan');
const treasuryRepository = require('../repositories/treasuryRepository');
const logger = require('../utils/structuredLogger');

/**
 * JIT Funding Orchestrator
 * Issue #959: Core brain for execution timing of capital movements.
 * Monitors rebalance plans and executes them within their JIT windows.
 */
class JitFundingOrchestrator {
    constructor() {
        this.CHECK_INTERVAL_MS = 30000; // 30 seconds
    }

    /**
     * Start the orchestration loop.
     */
    start() {
        setInterval(() => this.processPendingPlans(), this.CHECK_INTERVAL_MS);
        logger.info('[JIT-Orchestrator] Service started');
    }

    /**
     * Scan for plans entering their execution window and fire them.
     */
    async processPendingPlans() {
        const now = new Date();
        const executablePlans = await RebalancePlan.find({
            status: 'PENDING',
            'executionWindow.start': { $lte: now },
            'executionWindow.end': { $gte: now }
        });

        if (executablePlans.length === 0) return;

        logger.info(`[JIT-Orchestrator] Processing ${executablePlans.length} JIT plans`);

        for (const plan of executablePlans) {
            await this.executePlan(plan);
        }
    }

    /**
     * Execute a single rebalance plan atomically.
     */
    async executePlan(plan) {
        try {
            logger.info(`[JIT-Orchestrator] Executing Plan: ${plan._id} (${plan.amount} USD)`);

            await treasuryRepository.atomicTransfer(
                plan.sourceNodeId,
                plan.targetNodeId,
                plan.amount
            );

            plan.status = 'EXECUTED';
            await plan.save();

            logger.info(`[JIT-Orchestrator] ✓ Plan ${plan._id} executed successfully`);
        } catch (error) {
            logger.error(`[JIT-Orchestrator] ✗ Plan ${plan._id} failed: ${error.message}`);
            plan.status = 'FAILED';
            plan.failureReason = error.message;
            await plan.save();
        }
    }

    /**
     * Create a JIT rebalance trigger (called by guards or prophets).
     */
    async createJitTrigger(workspaceId, sourceNodeId, targetNodeId, amount, priority = 'CRITICAL') {
        const now = new Date();
        return await RebalancePlan.create({
            workspaceId,
            sourceNodeId,
            targetNodeId,
            amount,
            priority,
            triggerType: 'REAL_TIME_GUARD',
            executionWindow: {
                start: now,
                end: new Date(now.getTime() + 300000) // 5 minute window
            }
        });
    }
}

module.exports = new JitFundingOrchestrator();
