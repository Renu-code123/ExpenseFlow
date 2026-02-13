const User = require('../models/User');

/**
 * Notification Hydrator Middleware
 * Issue #646: Enriches the request context for complex notification generation
 */
const notificationHydrator = async (req, res, next) => {
    try {
        // Enforce user existence and grab critical alert metadata
        if (req.user && req.user._id) {
            const user = await User.findById(req.user._id).select('email name preferences');
            if (user) {
                // Attach enriched data for the notification hub
                req.notificationContext = {
                    userEmail: user.email,
                    userName: user.name,
                    timezone: user.preferences?.timezone || 'UTC'
                };
            }
        }
        next();
    } catch (error) {
        console.error('[NotificationHydrator] Error hydrating request:', error);
        next(); // Don't block the request if hydration fails
    }
};

module.exports = notificationHydrator;
