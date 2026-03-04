const logger = require('../utils/structuredLogger');

/**
 * Consensus Engine Service
 * Issue #769: Resolving concurrent edit conflicts using vector clocks.
 * Implements causal ordering to ensure consistency in co-edited workspaces.
 */
class ConsensusEngine {
    /**
     * Compare two vector clocks
     * Returns: 'greater', 'smaller', 'equal', or 'concurrent'
     */
    compareClocks(clockA, clockB) {
        let aGreater = false;
        let bGreater = false;

        const keys = new Set([...Object.keys(clockA), ...Object.keys(clockB)]);

        for (const key of keys) {
            const valA = clockA[key] || 0;
            const valB = clockB[key] || 0;

            if (valA > valB) aGreater = true;
            if (valB > valA) bGreater = true;
        }

        if (aGreater && bGreater) return 'concurrent';
        if (aGreater) return 'greater';
        if (bGreater) return 'smaller';
        return 'equal';
    }

    /**
     * Reconcile a pending journal entry against current entity state
     */
    async reconcile(currentEntity, journalEntry) {
        const currentClock = currentEntity.vectorClock || {};
        const journalClock = journalEntry.vectorClock || {};

        const relationship = this.compareClocks(journalClock, currentClock);

        if (relationship === 'greater') {
            // Success: Journal entry is a direct causal successor
            return { action: 'APPLY', mergedPayload: journalEntry.payload };
        }

        if (relationship === 'smaller' || relationship === 'equal') {
            // Stale: Journal entry is older or identical to current state
            return { action: 'DISCARD', reason: 'STALE_UPDATE' };
        }

        // Concurrent: Both states have diverged. Conflict resolution needed.
        return {
            action: 'CONFLICT',
            reason: 'CONCURRENT_EDIT',
            metadata: {
                currentClock,
                journalClock
            }
        };
    }
}

module.exports = new ConsensusEngine();
