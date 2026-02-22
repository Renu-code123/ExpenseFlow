/**
 * Diff Engine Utility
 * Issue #731: Logic to compare two JSON objects and extract modified fields.
 * Essential for forensic audit trails and "Time Travel" logic.
 */

class DiffEngine {
    /**
     * Compares two objects and returns the delta
     * @param {Object} before - Original state
     * @param {Object} after - New state
     * @returns {Object} An object containing changed fields with old and new values
     */
    compare(before, after) {
        const diff = {};

        // Normalize objects to plain JSON
        const b = JSON.parse(JSON.stringify(before || {}));
        const a = JSON.parse(JSON.stringify(after || {}));

        // Get all unique keys
        const keys = new Set([...Object.keys(b), ...Object.keys(a)]);

        for (const key of keys) {
            // Ignore internal Mongoose fields
            if (key === '__v' || key === 'updatedAt' || key === 'createdAt') continue;

            const valB = b[key];
            const valA = a[key];

            if (this._isDifferent(valB, valA)) {
                diff[key] = {
                    old: valB,
                    new: valA
                };
            }
        }

        return Object.keys(diff).length > 0 ? diff : null;
    }

    /**
     * Deep equality check for primitives and simple objects/arrays
     */
    _isDifferent(a, b) {
        if (a === b) return false;

        // Handle null/undefined cases
        if (a == null || b == null) return a !== b;

        // Handle Dates
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() !== b.getTime();
        }

        // Handle Arrays and Objects (simplified for this engine)
        if (typeof a === 'object' && typeof b === 'object') {
            return JSON.stringify(a) !== JSON.stringify(b);
        }

        return a !== b;
    }

    /**
     * Reconstructs an object from a history of diffs (Time Travel)
     */
    reconstruct(base, diffs) {
        let state = JSON.parse(JSON.stringify(base));

        for (const diff of diffs) {
            for (const [key, delta] of Object.entries(diff)) {
                state[key] = delta.new;
            }
        }

        return state;
    }
}

module.exports = new DiffEngine();
