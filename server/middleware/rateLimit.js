/**
 * Rate Limiting Middleware
 * Prevents API abuse by limiting requests per user/IP
 */

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map();

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (data.resetTime < now) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Clean up every minute

/**
 * Create rate limiter middleware
 * @param {Object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @param {string} options.message - Error message when limit exceeded
 * @param {string} options.keyGenerator - Function to generate unique key
 */
function createRateLimiter(options = {}) {
    const {
        windowMs = 60000, // 1 minute default
        max = 10, // 10 requests per window default
        message = 'Too many requests. Please try again later.',
        keyGenerator = null
    } = options;

    return (req, res, next) => {
        // Generate unique key for this user/request
        const key = keyGenerator
            ? keyGenerator(req)
            : getDefaultKey(req);

        const now = Date.now();
        let limitData = rateLimitStore.get(key);

        // Initialize or reset if window expired
        if (!limitData || limitData.resetTime < now) {
            limitData = {
                count: 0,
                resetTime: now + windowMs
            };
        }

        // Increment request count
        limitData.count++;
        rateLimitStore.set(key, limitData);

        // Set rate limit headers
        const remaining = Math.max(0, max - limitData.count);
        const resetSeconds = Math.ceil((limitData.resetTime - now) / 1000);

        res.set({
            'X-RateLimit-Limit': max,
            'X-RateLimit-Remaining': remaining,
            'X-RateLimit-Reset': resetSeconds
        });

        // Check if limit exceeded
        if (limitData.count > max) {
            return res.status(429).json({
                error: message,
                retryAfter: resetSeconds
            });
        }

        next();
    };
}

/**
 * Get default key based on user ID or IP
 */
function getDefaultKey(req) {
    if (req.user && req.user._id) {
        return `user_${req.user._id}`;
    }
    return `ip_${req.ip || req.connection.remoteAddress}`;
}

/**
 * Export rate limiter for specific routes
 */
const exportRateLimiter = createRateLimiter({
    windowMs: 60000, // 1 minute
    max: 5, // 5 exports per minute
    message: 'Export rate limit exceeded. Please wait before exporting again.',
    keyGenerator: (req) => `export_${req.user?._id || req.ip}`
});

/**
 * Strict rate limiter for expensive operations
 */
const strictRateLimiter = createRateLimiter({
    windowMs: 300000, // 5 minutes
    max: 10, // 10 requests per 5 minutes
    message: 'Rate limit exceeded. Please try again in a few minutes.',
    keyGenerator: (req) => `strict_${req.user?._id || req.ip}`
});

/**
 * General API rate limiter
 */
const apiRateLimiter = createRateLimiter({
    windowMs: 60000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many API requests. Please slow down.'
});

module.exports = {
    createRateLimiter,
    exportRateLimiter,
    strictRateLimiter,
    apiRateLimiter
};
