const treasuryRepository = require('../repositories/treasuryRepository');
const jitFundingOrchestrator = require('../services/jitFundingOrchestrator');
const logger = require('../utils/structuredLogger');

/**
 * Liquidity Provision Guard
 * Issue #959: Intercepting transactions to pull JIT funds if the operating node is low.
 * Acts as a failsafe when the nightly balancer or prophet misses a spike.
 */
const liquidityProvisionGuard = async (req, res, next) => {
    // Only apply to expense creation
    if (req.method !== 'POST' || !req.originalUrl.includes('/expenses')) {
        return next();
    }

    const { amount, workspaceId } = req.body;
    if (!amount || !workspaceId) return next();

    try {
        const operatingNode = await treasuryRepository.findNode(workspaceId, 'OPERATING');
        const reserveNode = await treasuryRepository.findNode(workspaceId, 'RESERVE');

        if (!operatingNode || !reserveNode) return next();

        // If operating node balance + incoming rebalances < amount
        // We trigger an IMMEDIATE JIT rebalance from RESERVE
        if (operatingNode.balance < amount) {
            logger.warn(`[LiquidityGuard] JIT Trigger! Operating node (${operatingNode.balance}) below transaction amount (${amount})`);

            const deficit = amount - operatingNode.balance;
            const buffer = deficit * 1.5; // Pull 1.5x of deficit to avoid immediate repeat

            if (reserveNode.balance >= buffer) {
                await jitFundingOrchestrator.createJitTrigger(
                    workspaceId,
                    reserveNode._id,
                    operatingNode._id,
                    buffer,
                    'CRITICAL'
                );

                logger.info(`[LiquidityGuard] JIT Plan created for ${buffer} USD from Reserve`);
            }
        }

        next();
    } catch (err) {
        logger.error('[LiquidityGuard] Error evaluating provision:', err);
        next();
    }
};

module.exports = liquidityProvisionGuard;
