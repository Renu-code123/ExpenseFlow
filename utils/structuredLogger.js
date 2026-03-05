const winston = require('winston');

/**
 * Structured Logger
 * Issue #755: Enhancing logs with tenant-trace IDs and forensic metadata.
 * Provides machine-readable logging for automated analysis.
 */
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'expense-flow' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        // Forensic log file
        new winston.transports.File({
            filename: 'logs/forensic.log',
            level: 'warn',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

/**
 * Helper to wrap logs with tenant context
 */
logger.withContext = (req) => {
    return {
        tenantId: req.tenant?._id,
        userId: req.user?._id,
        requestId: req.headers['x-request-id'] || 'system'
    };
};

/**
 * Issue #961: Helper to wrap logs with jurisdictional tagging.
 * Ensures every compliance-relevant action is stamped with its detected nexus.
 */
logger.withJurisdiction = (req, extra = {}) => {
    return {
        tenantId: req.tenant?._id,
        userId: req.user?._id,
        requestId: req.headers['x-request-id'] || 'system',
        jurisdictionCode: req.nexusContext?.jurisdictionCode || 'UNKNOWN',
        taxType: req.nexusContext?.taxType || null,
        ...extra
    };
};

module.exports = logger;
