const QuantumAnchor = require('../models/QuantumAnchor');
const pqcSignatureService = require('../services/pqcSignatureService');
const ResponseFactory = require('../utils/responseFactory');
const logger = require('../utils/structuredLogger');

/**
 * Quantum Integrity Guard
 * Issue #960: Verifying PQC anchors during high-value forensic replays.
 * Intercepts audit requests to ensure the data hasn't been tampered with post-quantum.
 */
const quantumIntegrityGuard = async (req, res, next) => {
    // Only apply to forensic audit requests
    if (!req.originalUrl.includes('/forensic-replay') && !req.originalUrl.includes('/audit')) {
        return next();
    }

    const shardId = req.query.shardId || req.body.shardId;
    if (!shardId) return next();

    try {
        // Fetch the latest PQC anchor for this shard
        const latestAnchor = await QuantumAnchor.findOne({ shardId })
            .sort({ snapshotSequence: -1 });

        if (!latestAnchor) {
            logger.warn(`[QuantumGuard] No PQC anchor found for shard: ${shardId}. Integrity unverified.`);
            return next();
        }

        // Verify the PQC signature
        const isValid = await pqcSignatureService.verifyAnchor(latestAnchor);

        if (!isValid) {
            logger.error(`[QuantumGuard] FATAL: PQC Anchor verification failed for shard ${shardId}!`);
            return ResponseFactory.error(res, 403, 'LEDGER_INTEGRITY_VIOLATION: Quantum-resistant forensic anchor mismatch.');
        }

        logger.info(`[QuantumGuard] ✓ PQC Anchor verified for shard: ${shardId}`);
        req.quantumVerified = true;
        next();
    } catch (error) {
        logger.error('[QuantumGuard] Verification error:', error);
        next();
    }
};

module.exports = quantumIntegrityGuard;
