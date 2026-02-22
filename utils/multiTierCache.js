/**
 * Multi-Tier Cache Utility
 * Issue #741: Implements L1 (In-Memory) and L2 (Simulated Distributed) caching.
 * Provides atomic lookups and TTL management.
 */

class MultiTierCache {
    constructor() {
        this.l1 = new Map(); // Local In-Memory Cache
        this.l2 = {};        // Simulated L2 (e.g., Redis/Global Store)
        this.ttl = 300000;   // 5 Minutes default TTL
    }

    /**
     * Get value from cache with tiered fallback
     */
    async get(key) {
        const now = Date.now();

        // 1. Check L1 (Fast)
        if (this.l1.has(key)) {
            const entry = this.l1.get(key);
            if (entry.expiry > now) {
                console.log(`[Cache] L1 Hit: ${key}`);
                return entry.value;
            }
            this.l1.delete(key); // Cleanup expired
        }

        // 2. Check L2 (Distributed)
        if (this.l2[key]) {
            const entry = this.l2[key];
            if (entry.expiry > now) {
                console.log(`[Cache] L2 Hit: ${key}`);
                // Refresh L1
                this.l1.set(key, entry);
                return entry.value;
            }
            delete this.l2[key];
        }

        return null;
    }

    /**
     * Set value across all tiers
     */
    async set(key, value, customTtl = null) {
        const expiry = Date.now() + (customTtl || this.ttl);
        const entry = { value, expiry };

        this.l1.set(key, entry);
        this.l2[key] = entry; // In production, this would be a Redis SET call

        return true;
    }

    /**
     * Delete from all tiers (Invalidation)
     */
    async del(key) {
        this.l1.delete(key);
        delete this.l2[key];
        return true;
    }

    /**
     * Clear all caches
     */
    async flush() {
        this.l1.clear();
        this.l2 = {};
    }
}

module.exports = new MultiTierCache();
