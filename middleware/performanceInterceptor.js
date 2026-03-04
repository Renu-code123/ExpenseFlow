const telemetryAggregator = require('../services/telemetryAggregator');

/**
 * Performance Interceptor Middleware
 * Issue #755: Timing every request-response cycle.
 * Transparently captures latency and resource usage across all endpoints.
 */
const performanceInterceptor = (req, res, next) => {
    const start = process.hrtime();

    // Attach listener to 'finish' event
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const latencyMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

        // Record telemetry asynchronously
        telemetryAggregator.recordEvent({
            type: 'performance',
            tenantId: req.tenant?._id || req.headers['x-tenant-id'],
            userId: req.user?._id,
            action: `${req.method} ${req.route?.path || req.path}`,
            latencyMs: parseFloat(latencyMs),
            statusCode: res.statusCode,
            path: req.path,
            method: req.method,
            metadata: {
                userAgent: req.headers['user-agent'],
                ip: req.ip
            }
        }).catch(err => console.error('[PerformanceInterceptor] Recording failed', err));
    });

    next();
};

module.exports = performanceInterceptor;
