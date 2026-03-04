const treasuryRepository = require('../repositories/treasuryRepository');
const mathTreasury = require('../utils/mathTreasury');
const intelligenceService = require('./intelligenceService');
const ledgerService = require('./ledgerService');
const logger = require('../utils/structuredLogger');

/**
 * Rebalancing Engine Service
 * Issue #768: Predictive logic for internal liquidity shifts between nodes.
 */
class RebalancingEngine {
    /**
     * Run rebalancing logic for a workspace
     */
    async rebalanceWorkspace(workspaceId) {
        logger.info(`[RebalancingEngine] Starting rebalance for workspace: ${workspaceId}`);

        // 1. Get current burn rate projection
        const analytics = await intelligenceService.calculateBurnRate(null, { workspaceId });
        const monthlyBurnRate = analytics.monthlyProjectedSpend || 0;

        // 2. Fetch all treasury nodes
        const nodes = await treasuryRepository.findByWorkspace(workspaceId);
        const operatingNode = nodes.find(n => n.nodeType === 'OPERATING');
        const reserveNode = nodes.find(n => n.nodeType === 'RESERVE');

        if (!operatingNode || !reserveNode) {
            logger.warn(`[RebalancingEngine] Missing critical nodes for workspace: ${workspaceId}`);
            return;
        }

        // 3. Calculate target operating balance (e.g., 1.5x monthly burn)
        const targetOperating = monthlyBurnRate * 1.5;
        const delta = mathTreasury.getRebalanceDelta(operatingNode.balance, targetOperating);

        if (Math.abs(delta) < 100) {
            logger.info(`[RebalancingEngine] Delta negligible for workspace: ${workspaceId}`);
            return;
        }

        // 4. Execute virtual transfer
        if (delta > 0) {
            // Need to move from Reserve to Operating
            await this.executeTransfer(reserveNode, operatingNode, delta, workspaceId);
        } else {
            // Surplus in Operating, move to Reserve
            await this.executeTransfer(operatingNode, reserveNode, Math.abs(delta), workspaceId);
        }
    }

    /**
     * Execute a virtual transfer between nodes
     */
    async executeTransfer(fromNode, toNode, amount, workspaceId) {
        if (fromNode.balance < amount) {
            logger.error(`[RebalancingEngine] Insufficient funds in ${fromNode.nodeType} for transfer`);
            return;
        }

        // Atomic updates
        await treasuryRepository.updateBalance(fromNode._id, -amount);
        await treasuryRepository.updateBalance(toNode._id, amount);

        // Record in ledger
        await ledgerService.recordEvent(
            null,
            'VIRTUAL_TRANSFER',
            {
                fromNode: fromNode._id,
                toNode: toNode._id,
                fromType: fromNode.nodeType,
                toType: toNode.nodeType,
                amount,
                currency: fromNode.currency
            },
            null, // System performed
            workspaceId
        );

        logger.info(`[RebalancingEngine] Transferred ${amount} from ${fromNode.nodeType} to ${toNode.nodeType}`);
    }
}

module.exports = new RebalancingEngine();
