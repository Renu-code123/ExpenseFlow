/**
 * Causal Math Utility
 * Issue #868: Implementation of Vector Clocks and Lamport Timestamp comparisons.
 * Helps in determining causal relationships (Happened-Before, Concurrent, etc.).
 */
class CausalMath {
    /**
     * Determines relationship between two vector clocks.
     * Returns: 'HAPPENED_BEFORE', 'HAPPENED_AFTER', 'CONCURRENT', 'EQUAL'
     */
    static compareVectorClocks(v1, v2) {
        let v1_less = false;
        let v1_greater = false;

        const allNodes = new Set([...Object.keys(v1), ...Object.keys(v2)]);

        for (const node of allNodes) {
            const val1 = v1[node] || 0;
            const val2 = v2[node] || 0;

            if (val1 < val2) v1_less = true;
            if (val1 > val2) v1_greater = true;
        }

        if (v1_less && !v1_greater) return 'HAPPENED_BEFORE';
        if (!v1_less && v1_greater) return 'HAPPENED_AFTER';
        if (v1_less && v1_greater) return 'CONCURRENT';
        return 'EQUAL';
    }

    /**
     * Merges two vector clocks by taking the maximum for each node's logical time.
     */
    static mergeVectorClocks(v1, v2) {
        const merged = { ...v1 };
        for (const [node, val] of Object.entries(v2)) {
            merged[node] = Math.max(merged[node] || 0, val);
        }
        return merged;
    }

    /**
     * Increments the clock for a specific node in the vector.
     */
    static incrementClock(vector, nodeId) {
        const updated = { ...vector };
        updated[nodeId] = (updated[nodeId] || 0) + 1;
        return updated;
    }
}

module.exports = CausalMath;
