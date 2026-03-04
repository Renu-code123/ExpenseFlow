const LedgerShard = require('../models/LedgerShard');
const logger = require('../utils/structuredLogger');

/**
 * Sharding Orchestrator
 * Issue #842: Routing logic for event writes across high-frequency shards.
 * Centralizes shard lifecycle management (creation, rotation, and selection).
 */
class ShardingOrchestrator {
    constructor() {
        this.shardCache = [];
        this.lastCacheRefresh = 0;
        this.cacheTTL = 60000; // 1 minute
    }

    /**
     * Get the appropriate shard for a given timestamp and tenant.
     */
    async getTargetShard(timestamp = new Date(), tenantCluster = 'GLOBAL') {
        const shards = await this._getShards();

        let shard = shards.find(s =>
            s.startTime <= timestamp &&
            s.endTime > timestamp &&
            s.tenantCluster === tenantCluster &&
            s.status === 'active'
        );

        if (!shard) {
            shard = await this._createNewShard(timestamp, tenantCluster);
            await this._refreshCache();
        }

        return shard;
    }

    /**
     * Find all shards that cover a specific temporal range.
     */
    async getShardsInRange(startTime, endTime, tenantCluster = 'GLOBAL') {
        return LedgerShard.find({
            startTime: { $lt: endTime },
            endTime: { $gt: startTime },
            tenantCluster
        }).sort({ startTime: 1 });
    }

    async _getShards() {
        if (Date.now() - this.lastCacheRefresh > this.cacheTTL) {
            await this._refreshCache();
        }
        return this.shardCache;
    }

    async _refreshCache() {
        this.shardCache = await LedgerShard.find({ status: { $ne: 'archived' } });
        this.lastCacheRefresh = Date.now();
    }

    async _createNewShard(timestamp, tenantCluster) {
        // Logic to determine shard boundaries (e.g., Monthly)
        const year = timestamp.getFullYear();
        const month = timestamp.getMonth();
        const startTime = new Date(year, month, 1);
        const endTime = new Date(year, month + 1, 1);

        const shardId = `ledger_${year}_${month + 1}_${tenantCluster.toLowerCase()}`;
        const collectionName = `events_${year}_m${month + 1}`;

        logger.info(`[Sharding] Creating new shard: ${shardId}`);

        return LedgerShard.findOneAndUpdate(
            { shardId },
            {
                shardId,
                collectionName,
                startTime,
                endTime,
                tenantCluster,
                status: 'active'
            },
            { upsert: true, new: true }
        );
    }
}

module.exports = new ShardingOrchestrator();
