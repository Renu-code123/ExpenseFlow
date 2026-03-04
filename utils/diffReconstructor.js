/**
 * Diff Reconstructor Utility
 * Issue #782: Translating event payloads back into entity objects.
 * Replays a series of patches to reach a specific point-in-time state.
 */
class DiffReconstructor {
    /**
     * Reconstruct state from a genesis payload and list of patches
     */
    static reconstruct(genesis, events) {
        let state = { ...genesis };

        for (const event of events) {
            const payload = event.payload || {};

            if (event.eventType === 'CREATED') {
                state = { ...payload };
            } else if (event.eventType === 'UPDATED') {
                // Apply update delta
                Object.assign(state, payload);
            } else if (event.eventType === 'DELETED') {
                state._isDeleted = true;
                state._deletedAt = event.timestamp;
            }
        }

        return state;
    }

    /**
     * Calculate what changed between two reconstructed states
     */
    static getDiff(stateA, stateB) {
        const diff = {};
        const keys = new Set([...Object.keys(stateA), ...Object.keys(stateB)]);

        for (const key of keys) {
            if (key.startsWith('_')) continue;

            const valA = JSON.stringify(stateA[key]);
            const valB = JSON.stringify(stateB[key]);

            if (valA !== valB) {
                diff[key] = {
                    from: stateA[key],
                    to: stateB[key]
                };
            }
        }
        return diff;
    }
}

module.exports = DiffReconstructor;
