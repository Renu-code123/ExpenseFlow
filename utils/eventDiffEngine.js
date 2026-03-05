/**
 * Event Diff Engine Utility
 * Issue #680: Calculates deep deltas between objects for event sourcing.
 */

const crypto = require('crypto');

class EventDiffEngine {
    /**
     * Calculate what changed between oldState and newState
     */
    calculateDelta(oldState, newState) {
        const delta = {};
        const keys = new Set([...Object.keys(oldState || {}), ...Object.keys(newState || {})]);

        for (const key of keys) {
            // Skip Mongoose internal keys
            if (key.startsWith('__') || key === 'updatedAt' || key === 'createdAt') continue;

            const oldVal = oldState ? oldState[key] : undefined;
            const newVal = newState[key];

            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                delta[key] = {
                    from: oldVal,
                    to: newVal
                };
            }
        }
        return delta;
    }

    /**
     * Generate a cryptographic checksum for an event
     */
    generateChecksum(payload, prevEventId) {
        const data = JSON.stringify(payload) + (prevEventId || 'ROOT');
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Reconstruct state by applying a series of events
     */
    reconstruct(initialState, events) {
        let state = { ...initialState };

        events.sort((a, b) => a.version - b.version).forEach(event => {
            const payload = event.payload;
            // If the payload is a full state snapshot, replace
            // If it's a delta, merge
            if (payload && payload._isDelta) {
                Object.keys(payload.diff).forEach(key => {
                    state[key] = payload.diff[key].to;
                });
            } else {
                state = { ...state, ...payload };
            }
        });

        return state;
    }
}

module.exports = new EventDiffEngine();
