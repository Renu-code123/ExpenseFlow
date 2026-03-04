const logger = require('../utils/structuredLogger');
const crypto = require('crypto');

/**
 * Request Correlation Middleware
 * Issue #713: Ensures every request has a unique Trace ID for log aggregation.
 */
const requestCorrelation = (req, res, next) => {
    // Generate or propagate Trace ID
    const traceId = req.header('x-trace-id') || crypto.randomUUID();

    // Set response header for client-side tracking
    res.setHeader('x-trace-id', traceId);

    const context = {
        traceId,
        startTime: Date.now(),
        ip: req.ip,
        method: req.method,
        url: req.originalUrl,
        userId: req.user ? req.user._id : null
    };

    // Run the rest of the request within the async context
    logger.getStorage().run(context, () => {
        next();
    });
};

module.exports = requestCorrelation;
