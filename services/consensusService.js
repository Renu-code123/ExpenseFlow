const vectorClockMath = require('../utils/vectorClockMath');
const SyncConflict = require('../models/SyncConflict');

/**
 * Consensus Service
 * Issue #705: Orchestrates field-level merging and conflict detection.
 */
class ConsensusService {
    /**
     * Resolve incoming state against current database state.
     */
    async reconcile(currentEntity, incomingData, deviceId, userId) {
        const currentClock = currentEntity.vectorClock?.toObject() || {};
        const incomingClock = incomingData.vectorClock || {};

        const comparison = vectorClockMath.compare(incomingClock, currentClock);

        if (comparison === 1) {
            // Incoming is strictly newer - Fast Forward
            return { action: 'update', data: incomingData, clock: incomingClock };
        }

        if (comparison === 0 || comparison === -1) {
            // Incoming is identical or strictly older - Reject/No-op
            return { action: 'ignore', reason: 'stale_clock' };
        }

        // comparison === null -> Conflict detected
        return await this._handleConflict(currentEntity, incomingData, deviceId, userId);
    }

    /**
     * Perform field-level semantic merge or log conflict for manual resolution.
     */
    async _handleConflict(currentEntity, incomingData, deviceId, userId) {
        const mergedData = { ...currentEntity.toObject() };
        const conflicts = [];

        // Simple field-level merge logic
        for (const [key, incomingValue] of Object.entries(incomingData)) {
            if (key === 'vectorClock' || key === '_id') continue;

            const currentValue = mergedData[key];
            if (JSON.stringify(currentValue) !== JSON.stringify(incomingValue)) {
                // Semantic check: can we auto-merge?
                if (typeof currentValue === 'number' && typeof incomingValue === 'number') {
                    // Example: for some metrics we might add, but for transactions we usually want latest
                    // Here we log as conflict for safety
                    conflicts.push(key);
                } else {
                    conflicts.push(key);
                }
            }
        }

        if (conflicts.length === 0) {
            // Clocks were concurrent but values were actually the same
            const mergedClock = vectorClockMath.merge(currentEntity.vectorClock.toObject(), incomingData.vectorClock);
            return { action: 'update', data: mergedData, clock: mergedClock };
        }

        // Persistent conflict log
        const conflictRecord = new SyncConflict({
            entityId: currentEntity._id,
            entityType: currentEntity.constructor.modelName,
            userId,
            baseState: currentEntity.toObject(),
            conflictingStates: [{
                deviceId,
                state: incomingData,
                vectorClock: incomingData.vectorClock
            }]
        });
        await conflictRecord.save();

        return {
            action: 'conflict',
            conflictId: conflictRecord._id,
            conflictingFields: conflicts
        };
    }
}

module.exports = new ConsensusService();
