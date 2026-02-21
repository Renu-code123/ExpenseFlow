const SearchIndex = require('../models/SearchIndex');
const metadataProcessor = require('../utils/metadataProcessor');
const logger = require('../utils/structuredLogger');

/**
 * Indexing Engine Service
 * Issue #720: Core logic to synchronize the SearchIndex with the Transaction database.
 * Uses semantic enrichment to build a rich search experience.
 */
class IndexingEngine {
    /**
     * Updates or creates a search index entry for a transaction
     */
    async indexTransaction(transaction) {
        try {
            // 1. Extract semantic metadata
            const enrichment = metadataProcessor.process(transaction);

            // 2. Prepare the indexed document
            const searchData = {
                userId: transaction.user,
                transactionId: transaction._id,
                searchText: `${transaction.description} ${transaction.merchant} ${transaction.notes || ''}`,
                merchant: transaction.merchant,
                amount: transaction.amount,
                currency: transaction.originalCurrency,
                category: transaction.category ? transaction.category.toString() : 'uncategorized',
                date: transaction.date,
                workspaceId: transaction.workspace,
                tags: enrichment.tags,
                sentiment: enrichment.sentiment,
                businessType: enrichment.businessType,
                isRecurring: enrichment.isRecurring,
                lastIndexedAt: new Date()
            };

            // 3. Update the flat search store (Upsert)
            await SearchIndex.findOneAndUpdate(
                { transactionId: transaction._id },
                searchData,
                { upsert: true, new: true }
            );

            // 4. Mirror enrichment back to the transaction for data pointer consistency
            transaction.searchMetadata = {
                tags: enrichment.tags,
                merchantSentiment: enrichment.sentiment,
                businessType: enrichment.businessType,
                isRecurringInferred: enrichment.isRecurring,
                indexedAt: new Date()
            };

            // Note: We don't call save() here to avoid recursive triggers if called from post-save hooks
            // But usually we would want to persist this back eventually.
            // For this implementation, we assume the index is the source of truth for search.

            return { success: true };
        } catch (err) {
            logger.error('Failed to index transaction', {
                transactionId: transaction._id,
                error: err.message
            });
            throw err;
        }
    }

    /**
     * Remove a transaction from the search index
     */
    async deindexTransaction(transactionId) {
        try {
            await SearchIndex.deleteOne({ transactionId });
            return { success: true };
        } catch (err) {
            logger.error('Failed to deindex transaction', { transactionId, error: err.message });
            throw err;
        }
    }

    /**
     * Batch re-indexing logic for bulk migrations or repairs
     */
    async reindexAllForUser(userId) {
        const Transaction = require('../models/Transaction');
        const transactions = await Transaction.find({ user: userId });

        logger.info(`Starting batch re-index for user ${userId}`, { count: transactions.length });

        const promises = transactions.map(t => this.indexTransaction(t));
        await Promise.all(promises);

        return { success: true, count: transactions.length };
    }
}

module.exports = new IndexingEngine();
