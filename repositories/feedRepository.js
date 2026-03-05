const BaseRepository = require('./baseRepository');
const FinancialEvent = require('../models/FinancialEvent');

/**
 * FeedRepository
 * Issue #910: Specialized access for sharded external bank statements.
 * Simulates retrieval of "Truth" data from third-party banking providers.
 */
class FeedRepository extends BaseRepository {
    constructor() {
        // We use FinancialEvent as a proxy for raw feed data in this architecture
        super(FinancialEvent);
    }

    /**
     * Fetch external bank transactions for a specific window.
     * In a real system, this would call Plaid, Stripe, or Yodlee.
     */
    async getExternalTransactions(workspaceId, startDate, endDate) {
        // Here we simulate external feed data
        // For POC, we return events marked with SYSTEM provider
        return await this.model.find({
            workspaceId,
            timestamp: { $gte: startDate, $lte: endDate },
            'payload.provider': { $exists: true }
        }).lean();
    }

    /**
     * Get orphaned feed items (items present in the bank but not in the ledger).
     */
    async findOrphans(workspaceId, ledgerTransactionIds) {
        return await this.model.find({
            workspaceId,
            _id: { $nin: ledgerTransactionIds },
            'payload.isExternal': true
        }).lean();
    }
}

module.exports = new FeedRepository();
