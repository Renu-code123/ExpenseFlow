const ledgerService = require('../services/ledgerService');
const ResponseFactory = require('../utils/ResponseFactory');

/**
 * Integrity Guard Middleware
 * Issue #738: Performs a real-time integrity check on an entity's event chain.
 * Rejects requests if the ledger has been tampered with or is broken.
 */
const integrityGuard = async (req, res, next) => {
    const entityId = req.params.id || req.body.transactionId;

    if (!entityId) return next();

    try {
        const audit = await ledgerService.auditChain(entityId);

        if (!audit.valid) {
            console.error(`[IntegrityGuard] Ledger breach detected for ${entityId}: ${audit.reason}`);

            return res.status(403).json({
                success: false,
                error: 'Ledger Integrity Violation',
                message: 'The cryptographic chain for this record has been compromised. Access is restricted for forensic audit.',
                details: {
                    reason: audit.reason,
                    brokenAt: audit.sequence
                }
            });
        }

        next();
    } catch (err) {
        console.error('[IntegrityGuard Error]:', err.message);
        next(); // Fail open but log
    }
};

module.exports = integrityGuard;
