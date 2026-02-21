const AppEventBus = require('../utils/AppEventBus');
const EVENTS = require('../config/eventRegistry');
const orchestrator = require('../services/notificationOrchestrator');


/**
 * Email Notification Listeners
 * Issue #711 & #721: Refactored to use central Omnichannel Orchestrator.
 */
class EmailListeners {
    init() {
        console.log('[EmailListeners] Initializing decoupled hooks...');

        // Subscribe to User Registration
        AppEventBus.subscribe(EVENTS.USER.REGISTERED, this.handleUserRegistration.bind(this));

        // Subscribe to Security Events
        AppEventBus.subscribe(EVENTS.SECURITY.LOGIN_FAILURE, this.handleSecurityAlert.bind(this));
    }

    async handleUserRegistration(user) {
        // Now using the omnichannel engine
        return orchestrator.dispatch('welcome-onboarding', user._id, {
            name: user.name,
            email: user.email
        });
    }

    async handleSecurityAlert(payload) {
        return orchestrator.dispatch('suspicious-login-detected', payload.userId || 'anonymous', {
            ip: payload.ip,
            device: payload.userAgent || 'Unknown Device',
            location: payload.location || 'Unknown'
        });
    }
}

module.exports = new EmailListeners();
