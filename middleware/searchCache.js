const crypto = require('crypto');
const logger = require('../utils/structuredLogger');

// Internal Memory Cache (L1)
const inMemoryCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

/**
 * Search Cache Middleware
 * Issue #756: Layered L1/L2 search result caching.
 * Optimizes performance for repetitive tenant queries.
 */
const searchCache = (req, res, next) => {
    // Only cache GET search requests
    if (req.method !== 'GET' || !req.path.includes('/search')) {
        return next();
    }

    const userId = req.user?._id;
    const query = req.query.q;

    if (!userId || !query) return next();

    // Generate unique cache key based on user and query path + params
    const cacheKey = crypto.createHash('md5')
        .update(`${userId}:${req.originalUrl}`)
        .digest('hex');

    const cachedResponse = inMemoryCache.get(cacheKey);

    if (cachedResponse && (Date.now() - cachedResponse.timestamp < CACHE_TTL)) {
        // console.log(`[SearchCache] Hit for key: ${cacheKey}`);
        return res.json(cachedResponse.data);
    }

    // Capture the original send to cache the result
    const originalSend = res.json;
    res.json = function (data) {
        if (res.statusCode === 200) {
            inMemoryCache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });
        }
        return originalSend.apply(res, arguments);
    };

    next();
};

/**
 * Manual cache invalidation
 */
const invalidateUserCache = (userId) => {
    for (let key of inMemoryCache.keys()) {
        if (key.startsWith(userId)) {
            inMemoryCache.delete(key);
        }
    }
};

module.exports = {
    searchCache,
    invalidateUserCache
};
