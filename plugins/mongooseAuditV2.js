const diffEngine = require('../utils/diffEngine');
const AuditLog = require('../models/AuditLog');

/**
 * Mongoose Audit Plugin V2
 * Issue #731: Automated auditing for Mongoose models.
 * Hooks into save, update, and delete middleware to capture state changes.
 */
module.exports = function auditPlugin(schema, options = {}) {
    const { modelName } = options;

    // Capture state before save for updates
    schema.pre('save', function (next) {
        if (!this.isNew) {
            // Store the current state in the document for post-save comparison
            this._previousState = this.toObject();
        }
        next();
    });

    // Handle Create and Update
    schema.post('save', async function (doc) {
        const action = doc._previousState ? 'update' : 'create';
        const before = doc._previousState || null;
        const after = doc.toObject();

        const diff = action === 'update' ? diffEngine.compare(before, after) : null;

        // Only log updates if something actually changed
        if (action === 'update' && !diff) return;

        try {
            await AuditLog.create({
                entityId: doc._id,
                entityModel: modelName,
                action,
                changes: {
                    before: action === 'update' ? before : null,
                    after,
                    diff
                },
                performedBy: doc._userContext || null, // Context injected by middleware
                severity: action === 'delete' ? 'high' : 'low'
            });
        } catch (err) {
            console.error('[AuditPlugin] Logging failure:', err.message);
        }
    });

    // Handle Remove/Delete
    schema.post('remove', async function (doc) {
        try {
            await AuditLog.create({
                entityId: doc._id,
                entityModel: modelName,
                action: 'delete',
                changes: {
                    before: doc.toObject(),
                    after: null
                },
                performedBy: doc._userContext || null,
                severity: 'high'
            });
        } catch (err) {
            console.error('[AuditPlugin] Deletion logging failure:', err.message);
        }
    });

    // Helper to inject user context into the document
    schema.methods.setAuditContext = function (userId) {
        this._userContext = userId;
    };
};
