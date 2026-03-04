const WriteJournal = require('../models/WriteJournal');
const logger = require('../utils/structuredLogger');

/**
 * Journal Interceptor Middleware
 * Issue #769: Intercepting mutations to redirect to the log.
 * Prevents direct DB writes by converting specific POST/PUT requests into journals.
 */
const journalInterceptor = async (req, res, next) => {
    // Only intercept mutations aimed at collaborative entities
    const mutableEntities = ['transactions', 'expenses', 'workspaces'];
    const entityType = req.path.split('/')[2]; // Expected structure: /api/expenses/...

    if ((req.method === 'POST' || req.method === 'PUT') && mutableEntities.includes(entityType)) {
        // Check if the request should be journaled (e.g., has collaborative header)
        if (req.headers['x-journal-deferred'] === 'true') {
            try {
                const journal = await WriteJournal.create({
                    entityId: req.params.id || new require('mongoose').Types.ObjectId(),
                    entityType: entityType.toUpperCase().slice(0, -1),
                    operation: req.method === 'POST' ? 'CREATE' : 'UPDATE',
                    payload: req.body,
                    vectorClock: req.body.vectorClock || {},
                    workspaceId: req.headers['x-workspace-id'] || req.user.activeWorkspace,
                    userId: req.user._id,
                    status: 'PENDING'
                });

                return res.status(202).json({
                    message: 'Update accepted for consensus processing',
                    journalId: journal._id,
                    status: 'JOURNALED'
                });
            } catch (err) {
                logger.error('Failed to intercept and journal request', { error: err.message });
                // Fallback to normal execution if journaling fails
            }
        }
    }

    next();
};

module.exports = journalInterceptor;
