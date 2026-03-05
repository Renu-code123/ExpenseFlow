const BaseRepository = require('./baseRepository');
const TreasuryNode = require('../models/TreasuryNode');

/**
 * TreasuryRepository
 * Issue #768: Specialized data access for virtual balances.
 */
class TreasuryRepository extends BaseRepository {
    constructor() {
        super(TreasuryNode);
    }

    /**
     * Get all nodes for a workspace
     */
    async findByWorkspace(workspaceId) {
        return await this.findAll({ workspaceId });
    }

    /**
     * Get specific node type for a workspace
     */
    async findNode(workspaceId, nodeType) {
        return await this.findOne({ workspaceId, nodeType });
    }

    /**
     * Atomic balance update
     */
    async updateBalance(nodeId, amount) {
        return await this.model.findByIdAndUpdate(
            nodeId,
            { $inc: { balance: amount } },
            { new: true }
        );
    }

    /**
     * Reserve funds for pending transaction
     */
    async reserveFunds(nodeId, amount) {
        const node = await this.model.findById(nodeId);
        if (node.balance - node.reservedAmount < amount) {
            throw new Error('Insufficient liquidity in treasury node');
        }

        return await this.model.findByIdAndUpdate(
            nodeId,
            { $inc: { reservedAmount: amount } },
            { new: true }
        );
    }

    /**
     * Get balance for a specific DNA type in a node.
     * Issue #866: DNA-Aware balance tracking.
     */
    async getDnaBalance(nodeId, sourceDna) {
        const node = await this.model.findById(nodeId);
        if (!node) return 0;

        const bucket = node.dnaRestrictedBuckets.find(b => b.sourceDna === sourceDna);
        return bucket ? bucket.amount : 0;
    }

    /**
     * Issue #959: Multi-node atomic transfer logic.
     * Moves funds between two nodes in a single transaction-like operation.
     */
    async atomicTransfer(sourceNodeId, targetNodeId, amount, session = null) {
        const queryOptions = session ? { session } : {};

        // 1. Decrement source
        const source = await this.model.findOneAndUpdate(
            { _id: sourceNodeId, balance: { $gte: amount } },
            { $inc: { balance: -amount } },
            { new: true, ...queryOptions }
        );

        if (!source) throw new Error('Insufficient funds in source node for atomic transfer');

        // 2. Increment target
        const target = await this.model.findByIdAndUpdate(
            targetNodeId,
            { $inc: { balance: amount } },
            { new: true, ...queryOptions }
        );

        return { source, target };
    }
}

module.exports = new TreasuryRepository();
