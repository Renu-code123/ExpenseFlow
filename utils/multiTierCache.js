/**
 * Multi-Tier Cache Interface
 * Issue #781: Interface for Redis + In-Memory L1/L2 caching.
 * Currently simulates L1 (Memory) and L2.
 */
class MultiTierCache {
    constructor() {
        this.cache = new Map();
    }

    async get(key) {
        if (!this.cache.has(key)) return null;

        const entry = this.cache.get(key);
        if (entry.expiresAt < Date.now()) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    async set(key, data, ttlSeconds = 300) {
        this.cache.set(key, {
            data,
            expiresAt: Date.now() + (ttlSeconds * 1000)
        });
    }

    async del(key) {
        this.cache.delete(key);
    }

    async flushNode(nodeId) {
        for (const [key, _] of this.cache.entries()) {
            if (key.includes(nodeId.toString())) {
                this.cache.delete(key);
            }
        }
    }
}

module.exports = new MultiTierCache();
