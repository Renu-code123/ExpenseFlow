const logger = require('../utils/structuredLogger');

/**
 * HTTP Request/Response Logger
 * Issue #713: Standardizes logging for all network traffic.
 */
const httpLogger = (req, res, next) => {
    const startTime = Date.now();

    // Log the incoming request
    logger.info(`Incoming ${req.method} ${req.originalUrl}`, {
        type: 'http_request',
        userAgent: req.get('user-agent'),
        referrer: req.get('referrer'),
        ip: req.ip
    });

    // Hook into the finish event to log the response
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const level = res.statusCode >= 500 ? 'error' : (res.statusCode >= 400 ? 'warn' : 'info');

        logger[level](`Completed ${req.method} ${req.originalUrl} [${res.statusCode}]`, {
            type: 'http_response',
            statusCode: res.statusCode,
            durationMs: duration,
            contentLength: res.get('content-length')
        });
    });

    next();
};

module.exports = httpLogger;
