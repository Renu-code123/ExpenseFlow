/**
 * Global Event Registry
 * Issue #711: Centralized naming convention for system-wide events.
 * Use past tense for events to indicate something that "has happened".
 */

module.exports = {
    USER: {
        REGISTERED: 'user.registered',
        UPDATED: 'user.updated',
        PASSWORD_CHANGED: 'user.password_changed',
        DELETED: 'user.deleted',
        ROLE_CHANGED: 'user.role_changed'
    },
    TRANSACTION: {
        CREATED: 'transaction.created',
        UPDATED: 'transaction.updated',
        DELETED: 'transaction.deleted',
        BULK_CREATED: 'transaction.bulk_created'
    },
    SYSTEM: {
        STARTUP: 'system.startup',
        MAINTENANCE_STARTED: 'system.maintenance_started',
        MAINTENANCE_COMPLETED: 'system.maintenance_completed'
    },
    SECURITY: {
        LOGIN_SUCCESS: 'security.login_success',
        LOGIN_FAILURE: 'security.login_failure',
        UNAUTHORIZED_ACCESS: 'security.unauthorized_access',
        PRIVILEGE_TRANSITION_DETECTED: 'security.privilege_transition_detected',
        JIT_PRIVILEGE_EXPIRED: 'security.jit_privilege_expired',
        ADMIN_ENDPOINT_ACCESSED: 'security.admin_endpoint_accessed',
        DATA_EXPORT_INITIATED: 'security.data_export_initiated',
        PAYMENT_MODIFIED: 'security.payment_modified',
        CONFIGURATION_MODIFIED: 'security.configuration_modified'
    }
};
