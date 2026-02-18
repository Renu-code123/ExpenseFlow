/**
 * Simple In-Memory LRU Cache Middleware
 * Issue #634: Enhances search performance
 */

const config = require('../config/search');

class SimpleCache {
    constructor() {
        this.cache = new Map();
        this.maxSize = config.cache.maxSize;
        this.ttl = config.cache.ttl * 1000; // to ms
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    set(key, value) {
        if (this.cache.size >= this.maxSize) {
            // Very simple eviction: delete first item (FIFO approximation)
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            value,
            expiry: Date.now() + this.ttl
        });
    }

    clear() {
        this.cache.clear();
    }
}

const searchCache = new SimpleCache();

const cacheMiddleware = (req, res, next) => {
    if (!config.cache.enabled) return next();

    // Create unique key based on URL and user
    const key = `${req.user._id}_${req.originalUrl}`;
    const cachedData = searchCache.get(key);

    if (cachedData) {
        return res.json({ ...cachedData, _cached: true });
    }

    // Override res.json to capture data
    const originalJson = res.json;
    res.json = function (data) {
        if (res.statusCode === 200) {
            searchCache.set(key, data);
        }
        return originalJson.call(this, data);
    };

    next();
};

module.exports = { cacheMiddleware, searchCache };
