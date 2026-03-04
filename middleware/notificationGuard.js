const logger = require('../utils/structuredLogger');

/**
 * Notification Guard Middleware
 * Issue #721: Protects users from notification spam and enforces frequency caps.
 */
const notificationGuard = (req, res, next) => {
    // This is a simplified guard for demonstration
    // In a full implementation, it would check Redis for rate limits per user/slug

    const userId = req.user ? req.user._id : 'anonymous';
    const slug = req.body.slug || 'unknown';

    // Simulated anti-spam check
    const recentNotifications = 0; // Would be fetched from cache/db
    const CAP_PER_HOUR = 10;

    if (recentNotifications >= CAP_PER_HOUR) {
        logger.warn('Notification frequency cap exceeded', { userId, slug });
        return res.status(429).json({
            success: false,
            error: 'Notification frequency cap exceeded. Please try again later.'
        });
    }

    next();
};

module.exports = notificationGuard;
