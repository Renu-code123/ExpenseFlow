const SyncLog = require('../models/SyncLog');
const conflictResolver = require('../utils/conflictResolver');
const mongoose = require('mongoose');

/**
 * Sync Manager Service
 * Issue #660: Orchestrates differential updates and conflict resolution
 */
class SyncManager {
    /**
     * Log a mutation for later differential sync
     */
    async logMutation(userId, deviceId, entity, operation, changes = {}) {
        const lastLog = await SyncLog.findOne({ userId }).sort({ version: -1 });
        const nextVersion = (lastLog ? lastLog.version : 0) + 1;

        const log = new SyncLog({
            userId,
            deviceId,
            entityType: entity.constructor.modelName,
            entityId: entity._id,
            operation,
            changes,
            version: nextVersion
        });

        await log.save();
        return nextVersion;
    }

    /**
     * Get changes for a client since their last known version
     */
    async getDifferentialUpdates(userId, lastClientVersion) {
        return await SyncLog.find({
            userId,
            version: { $gt: lastClientVersion }
        }).sort({ version: 1 });
    }

    /**
     * Apply an incoming update with conflict resolution
     */
    async applyIncomingUpdate(userId, deviceId, entityType, incomingData) {
        const Model = mongoose.model(entityType);
        const existing = await Model.findOne({ _id: incomingData._id, user: userId });

        if (!existing) {
            // New entity creation
            const newEntity = new Model({ ...incomingData, user: userId });
            await newEntity.save();
            await this.logMutation(userId, deviceId, newEntity, 'CREATE');
            return { action: 'CREATED', entity: newEntity };
        }

        // Run Conflict Resolution
        const resolution = conflictResolver.resolve(existing, incomingData, 'MERGE');

        if (resolution.conflicted) {
            existing.syncMetadata.conflicts.push({
                deviceId,
                timestamp: new Date(),
                data: incomingData
            });
        }

        Object.assign(existing, resolution.data);
        existing.version += 1;
        existing.syncMetadata.lastDeviceId = deviceId;

        await existing.save();

        // Log the change for other devices
        await this.logMutation(userId, deviceId, existing, 'UPDATE', incomingData);

        return {
            action: resolution.conflicted ? 'RESOLVED_CONFLICT' : 'UPDATED',
            entity: existing,
            logs: resolution.logs
        };
    }

    /**
     * Mark an entity as deleted (Soft Delete for Sync)
     */
    async softDelete(userId, deviceId, entityType, entityId) {
        const Model = mongoose.model(entityType);
        const entity = await Model.findOne({ _id: entityId, user: userId });

        if (entity) {
            entity.syncMetadata.isDeleted = true;
            entity.syncMetadata.deletedAt = new Date();
            await entity.save();
            await this.logMutation(userId, deviceId, entity, 'DELETE');
        }

        return { success: true };
    }

    /**
     * Coordinate distributed vector clocks for sharded events.
     * Issue #842: Ensures causal ordering across distributed shard collections.
     */
    async coordinateVectorClock(shardId, workspaceId, serverInstanceId) {
        const key = `vclock:${shardId}:${workspaceId}`;
        const redisCustom = require('ioredis');
        const redis = new redisCustom(process.env.REDIS_URL);

        // Increment logical clock for this instance/shard/workspace tuple
        const newClockValue = await redis.hincrby(key, serverInstanceId, 1);

        // Fetch full vector for causality checks
        const fullVector = await redis.hgetall(key);

        return {
            instanceId: serverInstanceId,
            version: newClockValue,
            vector: fullVector
        };
    }

    /**
     * Cross-master reconciliation for sharded histories.
     * Issue #868: Detects and resolves forks in the ledger.
     */
    async reconcileMultiMasterHeads(workspaceId, nodeHeads) {
        const conflictMergeEngine = require('./conflictMergeEngine');
        const CausalVector = require('../models/CausalVector');

        let winner = nodeHeads[0];

        for (let i = 1; i < nodeHeads.length; i++) {
            winner = await conflictMergeEngine.mergeHeads(winner, nodeHeads[i]);
        }

        // Update the converged vector for the workspace
        await CausalVector.findOneAndUpdate(
            { workspaceId },
            {
                vector: winner.vectorClock,
                nodeId: winner.nodeId,
                lastUpdated: new Date()
            },
            { upsert: true }
        );

        return winner;
    }
}

module.exports = new SyncManager();
