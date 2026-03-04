const AppEventBus = require('../utils/AppEventBus');
const EVENTS = require('../config/eventRegistry');
const logger = require('../utils/structuredLogger');
const orchestrator = require('../services/notificationOrchestrator');


/**
 * System Audit Listeners
 * Issue #711 & #721: Handles compliance and automated budget alerting.
 */
class AuditListeners {
    init() {
        console.log('[AuditListeners] Initializing forensic audit hooks...');

        // Subscribe to Transaction changes
        AppEventBus.subscribe(EVENTS.TRANSACTION.CREATED, this.handleTransactionCreated.bind(this));
        AppEventBus.subscribe(EVENTS.TRANSACTION.DELETED, this.handleTransactionDeleted.bind(this));
    }

    async handleTransactionCreated(transaction) {
        logger.info(`[AuditService] Transaction entry logged for ${transaction._id}`);

        // Business Logic: Check budget thresholds (Simulated)
        if (transaction.amount > 500) {
            await orchestrator.dispatch('budget-threshold-reached', transaction.user, {
                category: transaction.category || 'General',
                percentage: 85,
                amount: transaction.amount,
                limit: 600,
                currency: 'USD'
            });
        }
    }

    async handleTransactionDeleted(payload) {
        logger.warn(`[AuditService] Audit record recorded for deletion`, {
            id: payload.id
        });
    }
}

module.exports = new AuditListeners();
