/**
 * Conflict Resolver Utility
 * Issue #660: Implements Last-Write-Wins and Multi-Master merge strategies
 */

class ConflictResolver {
    /**
     * Resolve conflicts between local (incoming) and server (existing) data
     * @param {Object} serverData - Current document in MongoDB
     * @param {Object} incomingData - Mutated data from client
     * @param {string} strategy - 'LWW' (Last Write Wins) or 'MERGE'
     */
    resolve(serverData, incomingData, strategy = 'LWW') {
        const resolution = {
            data: { ...serverData.toObject() },
            conflicted: false,
            logs: []
        };

        const incomingVersion = incomingData.version || 0;
        const serverVersion = serverData.version || 0;

        // If client version is significantly behind, it's a conflict
        if (incomingVersion <= serverVersion) {
            resolution.conflicted = true;

            if (strategy === 'LWW') {
                // In LWW, we check timestamps if versions are ambiguous
                const incomingTime = new Date(incomingData.updatedAt || Date.now()).getTime();
                const serverTime = new Date(serverData.updatedAt).getTime();

                if (incomingTime > serverTime) {
                    // Client is actually newer despite version (e.g. offline edits)
                    resolution.data = { ...resolution.data, ...incomingData };
                    resolution.logs.push(`Resolved via LWW: Client data accepted`);
                } else {
                    resolution.logs.push(`Resolved via LWW: Server data kept`);
                }
            } else if (strategy === 'MERGE') {
                // Field-level merging logic
                Object.keys(incomingData).forEach(key => {
                    if (JSON.stringify(serverData[key]) !== JSON.stringify(incomingData[key])) {
                        // For simple fields, take newest. For complex like arrays, merge.
                        if (Array.isArray(serverData[key])) {
                            resolution.data[key] = [...new Set([...serverData[key], ...incomingData[key]])];
                            resolution.logs.push(`Merged array field: ${key}`);
                        } else {
                            resolution.data[key] = incomingData[key];
                            resolution.logs.push(`Overwrote field: ${key}`);
                        }
                    }
                });
            }
        } else {
            // No conflict, safe to apply
            resolution.data = { ...resolution.data, ...incomingData };
        }

        return resolution;
    }

    /**
     * Vector Clock comparison
     * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if concurrent
     */
    compareVectorClocks(v1, v2) {
        let v1Greater = false;
        let v2Greater = false;

        const allKeys = new Set([...Object.keys(v1), ...Object.keys(v2)]);

        for (const key of allKeys) {
            const val1 = v1[key] || 0;
            const val2 = v2[key] || 0;

            if (val1 > val2) v1Greater = true;
            if (val2 > val1) v2Greater = true;
        }

        if (v1Greater && !v2Greater) return 1;
        if (!v1Greater && v2Greater) return -1;
        return 0; // Concurrent or Equal
    }
}

module.exports = new ConflictResolver();
