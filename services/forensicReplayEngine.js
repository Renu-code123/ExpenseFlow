const ledgerRepository = require('../repositories/ledgerRepository');
const diffReconstructor = require('../utils/diffReconstructor');
const TemporalMath = require('../utils/temporalMath');
const logger = require('../utils/structuredLogger');

/**
 * Forensic Replay Engine Service
 * Issue #782 & #842: Reconstructing entity state by replaying financial events across shards.
 */
class ForensicReplayEngine {
    /**
     * Reconstruct state of an entity at a specific point in time (Sharded Support)
     */
    async getPointInTimeState(entityId, timestamp, options = {}) {
        const { tenantCluster = 'GLOBAL' } = options;
        logger.info(`[ForensicEngine] Reconstructing sharded state for ${entityId} at ${timestamp}`);

        // 1. Fetch events across shards up to that timestamp
        const events = await ledgerRepository.getEventStream(entityId, {
            endTimestamp: timestamp,
            tenantCluster
        });

        if (events.length === 0) {
            return null;
        }

        // 2. Map-Reduce style reconstruction: Play shards individually then merge
        // For efficiency, we group by shard boundary if the stream is huge
        const temporalBuckets = TemporalMath.sliceByTime(events);
        const partialStates = [];

        for (const bucket of Object.values(temporalBuckets)) {
            const partial = diffReconstructor.reconstruct({}, bucket);
            partialStates.push(partial);
        }

        const finalState = TemporalMath.mergeStates(partialStates);

        return {
            entityId,
            timestamp,
            version: events[events.length - 1].sequence,
            state: finalState,
            shardCount: Object.keys(temporalBuckets).length
        };
    }

    /**
     * Get a chronological diff history for an entity (Sharded Support)
     */
    async getAuditHistory(entityId, options = {}) {
        const { tenantCluster = 'GLOBAL' } = options;
        const events = await ledgerRepository.getEventStream(entityId, { tenantCluster });
        const history = [];

        let lastState = {};
        for (const event of events) {
            const currentState = diffReconstructor.reconstruct(lastState, [event]);
            const diff = diffReconstructor.getDiff(lastState, currentState);

            history.push({
                sequence: event.sequence,
                timestamp: event.timestamp,
                eventType: event.eventType,
                performedBy: event.performedBy,
                changes: diff
            });

            lastState = currentState;
        }

        return history;
    }

    /**
     * Reconstruct entity state using Causal Ordering.
     * Issue #868: Handles divergent (non-linear) histories by sorting by Vector Clock.
     */
    async reconstructCausalHistory(entityId, options = {}) {
        const CausalMath = require('../utils/causalMath');
        const events = await ledgerRepository.getEventStream(entityId, options);

        // Sort events based on Causal Ordering (Happened-Before)
        const sortedEvents = events.sort((a, b) => {
            const rel = CausalMath.compareVectorClocks(a.vectorClock, b.vectorClock);
            if (rel === 'HAPPENED_BEFORE') return -1;
            if (rel === 'HAPPENED_AFTER') return 1;
            return 0; // Concurrent or Equal
        });

        return diffReconstructor.reconstruct({}, sortedEvents);
    }
}

module.exports = new ForensicReplayEngine();
