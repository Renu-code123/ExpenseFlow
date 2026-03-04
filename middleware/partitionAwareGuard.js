const logger = require('../utils/structuredLogger');

/**
 * PartitionAwareGuard Middleware
 * Issue #868: Enabling "Degraded Mode" operations during master failures or network partitions.
 * High-probability transactions (like low-value expenses) are allowed even if 
 * global consensus is unavailable, with the promise of eventual consistency.
 */
const partitionAwareGuard = (req, res, next) => {
    const isPartitioned = req.headers['x-network-status'] === 'partitioned' || process.env.DEGRADED_MODE === 'true';

    if (isPartitioned) {
        logger.warn('[PartitionGuard] Operating in DEGRADED MODE. Causal consistency ensured locally.');

        // Mark request as eventually consistent
        req.eventualConsistency = true;
        res.setHeader('X-Consistency-Model', 'eventual');

        // Allow high-priority reads/writes, block high-risk operations (like treasury rebalancing)
        if (req.path.includes('/treasury/rebalance') || req.path.includes('/compliance/file')) {
            return res.status(503).json({
                success: false,
                message: 'Consensus-critical operation blocked during network partition.'
            });
        }
    }

    next();
};

module.exports = partitionAwareGuard;
