const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const indexingEngine = require('../services/indexingEngine');
const logger = require('../utils/structuredLogger');

/**
 * Search Indexer Job
 * Issue #720: Background worker to ensure SearchIndex is eventually consistent.
 * Scans for transactions that haven't been indexed recently.
 */

const start = () => {
    // Run every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        logger.info('[SearchIndexer] Starting periodic synchronization scan');

        try {
            // Find transactions modified but not indexed in the last 15 mins (or ever)
            const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

            const pendingTransactions = await Transaction.find({
                $or: [
                    { 'searchMetadata.indexedAt': { $exists: false } },
                    { 'searchMetadata.indexedAt': { $lt: fifteenMinsAgo }, updatedAt: { $gt: fifteenMinsAgo } }
                ]
            }).limit(500);

            if (pendingTransactions.length === 0) {
                logger.debug('[SearchIndexer] Index is up to date. No pending syncs.');
                return;
            }

            logger.info(`[SearchIndexer] Synchronizing ${pendingTransactions.length} items`);

            let successCount = 0;
            for (const tx of pendingTransactions) {
                try {
                    await indexingEngine.indexTransaction(tx);
                    // Update the transaction to prevent re-scanning in this cycle
                    tx.searchMetadata.indexedAt = new Date();
                    await tx.save();
                    successCount++;
                } catch (err) {
                    logger.error(`[SearchIndexer] Failed to index ${tx._id}`, { error: err.message });
                }
            }

            logger.info(`[SearchIndexer] Scan completed. Successfully indexed ${successCount}/${pendingTransactions.length} items.`);

        } catch (err) {
            logger.error('[SearchIndexer] Critical failure in scan job', { error: err.message });
        }
    });
};

module.exports = { start };
