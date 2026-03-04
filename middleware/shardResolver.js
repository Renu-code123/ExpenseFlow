const shardingOrchestrator = require('../services/shardingOrchestrator');

/**
 * Shard Resolver Middleware
 * Issue #842: Injects appropriate shard-context headers and metadata into requests.
 * This ensures downstream services know which ledger shard to query.
 */
const shardResolver = async (req, res, next) => {
    try {
        const tenantCluster = req.headers['x-tenant-cluster'] || 'GLOBAL';
        const targetTime = req.query.asOf ? new Date(req.query.asOf) : new Date();

        // Attach shard context to the request
        const shard = await shardingOrchestrator.getTargetShard(targetTime, tenantCluster);

        req.shardContext = {
            shardId: shard.shardId,
            collectionName: shard.collectionName,
            tenantCluster: shard.tenantCluster
        };

        // For auditing/debugging
        res.setHeader('X-Ledger-Shard', shard.shardId);

        next();
    } catch (error) {
        console.error('[ShardResolver] Failed to resolve shard:', error);
        next(); // Fallback to monolithic ledger behavior if sharding fails
    }
};

module.exports = shardResolver;
