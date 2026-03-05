const crypto = require('crypto');
const logger = require('../utils/structuredLogger');

/**
 * Request Correlation Middleware
 * Issue #883: Introduce per-request Trace ID for end-to-end observability.
 */
const requestCorrelation = (req, res, next) => {
    const traceId = req.header('x-trace-id') || crypto.randomUUID();

    // Attach to request object for downstream access
    req.traceId = traceId;

    // Return trace ID to client
    res.setHeader('x-trace-id', traceId);

    const context = {
        traceId,
        startTime: Date.now(),
        ip: req.ip,
        method: req.method,
        url: req.originalUrl,
        userId: req.user ? req.user._id : null
    };

    logger.getStorage().run(context, () => {
        next();
    });
};

module.exports = requestCorrelation;