const logger = require('../utils/structuredLogger');

/**
 * Audit Interceptor Middleware
 * Issue #731: Injects request context into Mongoose mutations for polymorphic auditing.
 */
const auditInterceptor = (req, res, next) => {
    // We attach a helper to the request to allow services to easily set audit context
    req.auditContext = {
        userId: req.user ? req.user._id : null,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'] || `req_${Date.now()}`
    };

    // Monkey-patch mongoose document creation/fetching if needed
    // However, it's safer to explicitly call doc.setAuditContext(req.user._id) in controllers.
    // To automate this, we can use a pre-save hook globally or in the plugin.

    // For now, we use this middleware to log sensitive GET requests too
    if (req.method === 'DELETE' || (req.method === 'GET' && req.path.includes('/audit'))) {
        logger.info(`Forensic access detected: ${req.method} ${req.path}`, {
            user: req.user ? req.user.email : 'anonymous',
            ip: req.auditContext.ip
        });
    }

    next();
};

module.exports = auditInterceptor;
