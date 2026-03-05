/**
 * Vector Clock Math Utility
 * Issue #705: Provides mathematical operations for partial ordering in distributed systems.
 */

class VectorClockMath {
    /**
     * Compare two vector clocks.
     * Returns:
     *  1: A is after B (A > B)
     * -1: A is before B (A < B)
     *  0: A and B are identical
     *  null: A and B are concurrent (conflict)
     */
    compare(clockA, clockB) {
        let aGreater = false;
        let bGreater = false;

        const keys = new Set([...Object.keys(clockA), ...Object.keys(clockB)]);

        for (const key of keys) {
            const valA = clockA[key] || 0;
            const valB = clockB[key] || 0;

            if (valA > valB) aGreater = true;
            if (valB > valA) bGreater = true;
        }

        if (aGreater && bGreater) return null; // Concurrent
        if (aGreater) return 1;
        if (bGreater) return -1;
        return 0;
    }

    /**
     * Merge two vector clocks by taking the maximum of each component.
     */
    merge(clockA, clockB) {
        const merged = { ...clockA };
        for (const [node, value] of Object.entries(clockB)) {
            merged[node] = Math.max(merged[node] || 0, value);
        }
        return merged;
    }

    /**
     * Increment the clock for a specific node (device).
     */
    increment(clock, node) {
        const nextClock = { ...clock };
        nextClock[node] = (nextClock[node] || 0) + 1;
        return nextClock;
    }

    /**
     * Check if clock A is strictly concurrent with clock B
     */
    isConcurrent(clockA, clockB) {
        return this.compare(clockA, clockB) === null;
    }
}

module.exports = new VectorClockMath();
