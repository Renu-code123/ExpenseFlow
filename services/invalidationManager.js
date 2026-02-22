const cache = require('../utils/multiTierCache');

/**
 * Invalidation Manager
 * Issue #741: Manages dependency-aware cache purging.
 * Handles cascading invalidations across entities.
 */

class InvalidationManager {
    constructor() {
        this.dependencies = new Map(); // key -> [dependentKeys]
    }

    /**
     * Map a dependency (e.g. Workspace -> Analytics)
     */
    track(key, dependentKey) {
        if (!this.dependencies.has(key)) {
            this.dependencies.set(key, new Set());
        }
        this.dependencies.get(key).add(dependentKey);
    }

    /**
     * Atomic purge of a key and its dependents
     */
    async purge(key, visited = new Set()) {
        if (visited.has(key)) return;
        visited.add(key);

        console.log(`[Invalidation] Purging key: ${key}`);

        // 1. Purge the target
        await cache.del(key);

        // 2. Cascade through dependencies
        if (this.dependencies.has(key)) {
            const dependents = this.dependencies.get(key);
            for (const depKey of dependents) {
                await this.purge(depKey, visited); // Recursive cascade with safety
            }
            this.dependencies.delete(key);
        }
    }

    /**
     * Helper to purge entire workspace related cache
     */
    async purgeWorkspace(workspaceId) {
        // Broad pattern match (in production use Redis SCAN/UNLINK)
        const keysToPurge = [
            `analytics:${workspaceId}`,
            `reports:${workspaceId}`,
            `budget:${workspaceId}`,
            `health:${workspaceId}`
        ];

        for (const k of keysToPurge) {
            await this.purge(k);
        }
    }
}

module.exports = new InvalidationManager();
