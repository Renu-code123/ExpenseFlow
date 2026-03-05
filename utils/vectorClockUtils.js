/**
 * Vector Clock Utilities
 * Issue #730: Causal ordering logic for distributed state synchronization.
 */

class VectorClockUtils {
    /**
     * Determines relationship between two vector clocks
     * @returns {string} 'equal', 'greater', 'smaller', or 'concurrent'
     */
    compare(clockA, clockB) {
        let aHasGreater = false;
        let bHasGreater = false;

        const allKeys = new Set([...Object.keys(clockA), ...Object.keys(clockB)]);

        for (const key of allKeys) {
            const valA = clockA[key] || 0;
            const valB = clockB[key] || 0;

            if (valA > valB) aHasGreater = true;
            if (valB > valA) bHasGreater = true;
        }

        if (aHasGreater && bHasGreater) return 'concurrent'; // Conflict!
        if (aHasGreater) return 'greater';
        if (bHasGreater) return 'smaller';
        return 'equal';
    }

    /**
     * Increment a specific device's counter in the clock
     */
    increment(clock, deviceId) {
        const newClock = { ...clock };
        newClock[deviceId] = (newClock[deviceId] || 0) + 1;
        return newClock;
    }

    /**
     * Merge two clocks by taking the maximum of each component
     */
    merge(clockA, clockB) {
        const merged = { ...clockA };
        for (const [key, value] of Object.entries(clockB)) {
            merged[key] = Math.max(merged[key] || 0, value);
        }
        return merged;
    }

    /**
     * Check if a clock is strictly causal to another
     */
    isCausal(oldClock, newClock) {
        const relation = this.compare(oldClock, newClock);
        return relation === 'smaller' || relation === 'equal';
    }
}

module.exports = new VectorClockUtils();
