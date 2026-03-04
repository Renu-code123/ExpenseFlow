const logger = require('../utils/structuredLogger');

/**
 * Job Guard Middleware
 * Issue #719: Prevents unauthorized manual triggers of sensitive background tasks.
 * Validates admin status or specific system-to-system auth tokens.
 */
const jobGuard = (req, res, next) => {
    // 1. Ensure user is authenticated
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // 2. Check for Admin role or specified System Token
    const isAdmin = req.user.role === 'admin';
    const isSystemTrigger = req.headers['x-system-token'] === process.env.SYSTEM_TASK_TOKEN;

    if (!isAdmin && !isSystemTrigger) {
        logger.warn('Forbidden manual job trigger attempt', {
            userId: req.user._id,
            job: req.params.jobName || req.body.jobName
        });

        return res.status(403).json({
            success: false,
            error: 'You do not have permission to manage background tasks.'
        });
    }

    next();
};

module.exports = jobGuard;
