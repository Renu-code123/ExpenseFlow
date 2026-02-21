const logger = require('../utils/structuredLogger');

/**
 * Search Cache Middleware
 * Issue #720: In-memory cache for frequent search queries to reduce DB load.
 * In production, this would use Redis. Here we use an LRU-style local Map.
 */

const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

const searchCache = (req, res, next) => {
    // Only escape for GET search requests
    if (req.method !== 'GET' || !req.originalUrl.includes('/api/search')) {
        return next();
    }

    const cacheKey = `${req.user._id}:${JSON.stringify(req.query)}`;
    const cachedItem = cache.get(cacheKey);

    if (cachedItem && (Date.now() - cachedItem.timestamp < CACHE_TTL)) {
        logger.debug('Search cache hit', { userId: req.user._id, query: req.query });
        return res.json(cachedItem.data);
    }

    // Capture the original res.json to store the result in cache
    const originalJson = res.json;
    res.json = function (data) {
        if (res.statusCode === 200) {
            cache.set(cacheKey, {
                timestamp: Date.now(),
                data: data
            });
        }
        return originalJson.call(this, data);
    };

    next();
};

/**
 * Helper to clear cache (e.g., when a new transaction is added)
 */
const invalidateUserSearchCache = (userId) => {
    for (const key of cache.keys()) {
        if (key.startsWith(`${userId}:`)) {
            cache.delete(key);
        }
    }
};

module.exports = { searchCache, invalidateUserSearchCache };
