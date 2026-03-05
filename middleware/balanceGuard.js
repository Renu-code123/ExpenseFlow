const treasuryRepository = require('../repositories/treasuryRepository');
const logger = require('../utils/structuredLogger');

/**
 * Balance Guard Middleware
 * Issue #768: Preventing overdrafts across decentralized ledger nodes.
 */
const balanceGuard = async (req, res, next) => {
    // Only apply to mutations that impact liquidity
    if (req.method !== 'POST' && req.method !== 'PUT') return next();

    // We only guard endpoints that specify a workspace
    const workspaceId = req.headers['x-workspace-id'] || req.user?.activeWorkspace;
    if (!workspaceId) return next();

    // Skip balance check for non-expense routes (e.g., settings)
    if (!req.path.includes('expenses') && !req.path.includes('transactions')) return next();

    try {
        const amount = req.body.amount || 0;
        if (amount <= 0) return next();

        // Check OPERATING node balance
        const operatingNode = await treasuryRepository.findNode(workspaceId, 'OPERATING');

        if (!operatingNode) {
            // If no treasury system initialized for this tenant, we allow it (graceful migration)
            return next();
        }

        if (operatingNode.balance - operatingNode.reservedAmount < amount) {
            logger.warn(`[BalanceGuard] Overdraft blocked for workspace ${workspaceId}`, {
                amount,
                available: operatingNode.balance - operatingNode.reservedAmount
            });

            return res.status(402).json({
                error: 'Insufficient virtual liquidity in operating fund',
                code: 'TREASURY_OVERDRAFT',
                availableBalance: operatingNode.balance - operatingNode.reservedAmount,
                suggestedAction: 'rebalance_required'
            });
        }

        // Reserve the funds for this request
        await treasuryRepository.reserveFunds(operatingNode._id, amount);
        req.treasuryReserved = { nodeId: operatingNode._id, amount };

        next();
    } catch (err) {
        logger.error('[BalanceGuard] Execution error', { error: err.message });
        next();
    }
};

module.exports = balanceGuard;
