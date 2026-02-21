const NotificationTemplate = require('../models/NotificationTemplate');
const NotificationPreference = require('../models/NotificationPreference');
const templateResolver = require('../utils/templateResolver');
const logger = require('../utils/structuredLogger');

/**
 * Notification Orchestrator Service
 * Issue #721: Handles routing, preferences, template resolution, and multi-channel delivery.
 */
class NotificationOrchestrator {
    /**
     * Entry point for sending alerts
     */
    async dispatch(slug, userId, variables = {}, options = {}) {
        try {
            // 1. Fetch Template
            const template = await NotificationTemplate.findOne({ slug, isActive: true });
            if (!template) {
                logger.error('Notification template not found', { slug });
                return { success: false, error: 'Template not found' };
            }

            // 2. Check User Preferences
            const preferences = await this._getUserPreferences(userId, slug);
            if (preferences.globalUnsubscribe || preferences.frequency === 'off') {
                logger.debug('Notification skipped: User unsubscribed', { slug, userId });
                return { success: true, status: 'skipped_by_user' };
            }

            // 3. Resolve Content
            const content = templateResolver.resolve(template, variables);

            // 4. Route to Channels based on preferences
            const results = await this._routeToChannels(content, userId, preferences, options);

            return { success: true, results };

        } catch (err) {
            logger.error('Notification dispatch failure', { slug, error: err.message });
            return { success: false, error: err.message };
        }
    }

    /**
     * Internal router for different delivery providers
     */
    async _routeToChannels(content, userId, prefs, options) {
        const results = {};

        // Email Channel
        if (content.email?.enabled && prefs.channels.email && !options.skipEmail) {
            results.email = await this._sendEmail(content.email, userId);
        }

        // Push Channel
        if (content.push?.enabled && prefs.channels.push && !options.skipPush) {
            results.push = await this._sendPush(content.push, userId);
        }

        // In-App Channel
        if (content.inApp?.enabled && prefs.channels.inApp) {
            results.inApp = await this._sendInApp(content.inApp, userId);
        }

        return results;
    }

    async _getUserPreferences(userId, slug) {
        try {
            const userPrefs = await NotificationPreference.findOne({ user: userId });
            if (!userPrefs) return this._getDefaultPreferences();

            const specific = userPrefs.preferences.find(p => p.slug === slug);
            if (specific) return {
                globalUnsubscribe: userPrefs.globalUnsubscribe,
                channels: specific.channels,
                frequency: specific.frequency
            };

            return this._getDefaultPreferences();
        } catch (err) {
            return this._getDefaultPreferences();
        }
    }

    _getDefaultPreferences() {
        return {
            globalUnsubscribe: false,
            channels: { email: true, push: true, sms: false, inApp: true },
            frequency: 'immediate'
        };
    }

    async _sendEmail(content, userId) {
        // Simulated Email Provider integration
        return { status: 'success', provider: 'SendGrid', messageId: 'sg_' + Date.now() };
    }

    async _sendPush(content, userId) {
        // Simulated Push Provider integration
        return { status: 'success', provider: 'Firebase', messageId: 'fcm_' + Date.now() };
    }

    async _sendInApp(content, userId) {
        // Log to DB for In-App feed (Simplified)
        return { status: 'success', provider: 'InternalDB' };
    }
}

module.exports = new NotificationOrchestrator();
