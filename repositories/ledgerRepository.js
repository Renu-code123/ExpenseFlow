const BaseRepository = require('./baseRepository');
const FinancialEvent = require('../models/FinancialEvent');
const shardingOrchestrator = require('../services/shardingOrchestrator');
const mongoose = require('mongoose');

/**
 * LedgerRepository
 * Issue #782 & #842: Specialized retrieval for sharded forensic replay.
 */
class LedgerRepository extends BaseRepository {
    constructor() {
        super(FinancialEvent);
    }

    /**
     * Get chronologically ordered event stream for an entity across multiple shards.
     */
    async getEventStream(entityId, options = {}) {
        const { limit = 1000, startTimestamp = null, endTimestamp = null, tenantCluster = 'GLOBAL', shardCollection = null } = options;

        // Find relevant shards
        const startTime = startTimestamp ? new Date(startTimestamp) : new Date(0);
        const endTime = endTimestamp ? new Date(endTimestamp) : new Date();

        // If a specific shard is provided (e.g., from anchor job), use it directly
        const shards = shardCollection ? [{ collectionName: shardCollection }] : await shardingOrchestrator.getShardsInRange(startTime, endTime, tenantCluster);

        let allEvents = [];

        // If no shards found, fallback to the main collections
        if (shards.length === 0) {
            const query = entityId ? { entityId } : {};
            if (endTimestamp) query.timestamp = { $lte: endTime };
            allEvents = await this.findAll(query, { sort: { sequence: 1 }, limit });
        } else {
            // Aggregate events from all relevant shards
            for (const shard of shards) {
                const ShardModel = mongoose.model(shard.collectionName, FinancialEvent.schema, shard.collectionName);
                const query = entityId ? { entityId } : {};
                if (startTimestamp) query.timestamp = { $gte: startTime };
                if (endTimestamp) query.timestamp = { $lte: endTime, ...query.timestamp };

                const events = await ShardModel.find(query).sort({ sequence: 1 }).limit(limit).lean();
                allEvents = allEvents.concat(events);

                if (allEvents.length >= limit) break;
            }
        }

        return allEvents.slice(0, limit);
    }

    /**
     * Issue #960: Verify a sequence of events against PQC Quantum Anchors.
     */
    async verifyQuantumAnchors(shardId, events) {
        const QuantumAnchor = require('../models/QuantumAnchor');
        const LatticeMath = require('../utils/latticeMath');
        const pqcSignatureService = require('../services/pqcSignatureService');

        const anchor = await QuantumAnchor.findOne({ shardId }).sort({ snapshotSequence: -1 });
        if (!anchor) return true; // No anchor to check against

        const isSignatureValid = await pqcSignatureService.verifyAnchor(anchor);
        if (!isSignatureValid) return false;

        const currentRoot = LatticeMath.computeStateRoot(events);
        return currentRoot === anchor.stateRoot;
    }

    /**
     * Record a new event into a specific shard.
     */
    async recordToShard(eventData, shard) {
        const ShardModel = mongoose.model(shard.collectionName, FinancialEvent.schema, shard.collectionName);
        return await ShardModel.create(eventData);
    }

    /**
     * Get all event hashes for a workspace within a time range (Sharded support)
     */
    async getHashesForRange(workspaceId, startSequence, endSequence) {
        // For simplicity, we assume this still hits the primary collection or we route based on sequence
        // In a true sharded system, we'd need to know which shard contains the sequence range
        return await this.model.find({
            workspaceId,
            sequence: { $gte: startSequence, $lte: endSequence }
        })
            .sort({ sequence: 1 })
            .select('currentHash')
            .lean();
    }

    /**
     * Get the latest "Heads" from different master nodes for a workspace.
     * Issue #868: Identifies divergent histories across nodes.
     */
    async getMultiMasterHeads(workspaceId) {
        return await this.model.aggregate([
            { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId) } },
            { $sort: { timestamp: -1 } },
            {
                $group: {
                    _id: "$forensicTraceId", // Group by node/session trace
                    latestEvent: { $first: "$$ROOT" }
                }
            },
            { $replaceRoot: { newRoot: "$latestEvent" } }
        ]);
    }
}

module.exports = new LedgerRepository();
