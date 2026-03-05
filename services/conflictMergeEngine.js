const CausalMath = require('../utils/causalMath');
const logger = require('../utils/structuredLogger');

/**
 * ConflictMergeEngine Service
 * Issue #868: Logic for merging divergent shard histories from multi-master nodes.
 * Resolves concurrent updates using Win-Win (Merge) or LWW (Last-Write-Wins) strategies.
 */
class ConflictMergeEngine {
    /**
     * Merge event streams from two different master nodes.
     */
    async mergeHeads(headA, headB) {
        const relationship = CausalMath.compareVectorClocks(headA.vectorClock, headB.vectorClock);

        if (relationship === 'HAPPENED_BEFORE') return headB;
        if (relationship === 'HAPPENED_AFTER') return headA;

        if (relationship === 'CONCURRENT') {
            logger.warn(`[ConflictMerge] Concurrent update detected for ${headA.entityId}`);
            return this._resolveConcurrent(headA, headB);
        }

        return headA; // EQUAL
    }

    /**
     * Resolves concurrent updates using a deterministic "Causal Priority" algorithm.
     */
    _resolveConcurrent(eventA, eventB) {
        // Strategy: Deterministic Merge or LWW based on timestamp and node ID
        const timeA = eventA.timestamp.getTime();
        const timeB = eventB.timestamp.getTime();

        if (timeA !== timeB) {
            return timeA > timeB ? eventA : eventB;
        }

        // Tie-breaker: Deterministic string comparison of node IDs or signatures
        return eventA.signature > eventB.signature ? eventA : eventB;
    }

    /**
     * Calculates the "Causal Cut" (common ancestor) between two divergent histories.
     */
    calculateCausalCut(streamA, streamB) {
        // In a real implementation, this would find the last common vector clock state
        // and return the list of events that need to be replayed or rolled back.
        return streamA.filter(ea =>
            !streamB.some(eb => CausalMath.compareVectorClocks(ea.vectorClock, eb.vectorClock) === 'EQUAL')
        );
    }
}

module.exports = new ConflictMergeEngine();
