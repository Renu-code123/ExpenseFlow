const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const forensicReplayEngine = require('../services/forensicReplayEngine');
const ledgerService = require('../services/ledgerService');
const shardingOrchestrator = require('../services/shardingOrchestrator');
const LedgerShard = require('../models/LedgerShard');
const ResponseFactory = require('../utils/responseFactory');

/**
 * Forensic & Integrity Routes
 * Issue #782 & #842: API for sharded forensic replay and temporal state-slicing.
 */

/**
 * @route   GET /api/forensics/replay/:entityId
 * @desc    Get the state of an entity at a specific point in time (Sharded)
 */
router.get('/replay/:entityId', auth, async (req, res) => {
    try {
        const { timestamp, tenantCluster } = req.query;
        const state = await forensicReplayEngine.getPointInTimeState(
            req.params.entityId,
            timestamp || new Date(),
            { tenantCluster: tenantCluster || 'GLOBAL' }
        );

        if (!state) return ResponseFactory.error(res, 404, 'No forensic data found for this entity');

        return ResponseFactory.success(res, state);
    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   GET /api/forensics/shards
 * @desc    List all available ledger shards (Admin only)
 */
router.get('/shards', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return ResponseFactory.error(res, 403, 'Admin access required');
        }
        const shards = await LedgerShard.find().sort({ startTime: -1 });
        return ResponseFactory.success(res, shards);
    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   POST /api/forensics/shards/mount/:shardId
 * @desc    Explicitly mount a shard context for a specific audit session
 */
router.post('/shards/mount/:shardId', auth, async (req, res) => {
    try {
        const shard = await LedgerShard.findOne({ shardId: req.params.shardId });
        if (!shard) return ResponseFactory.error(res, 404, 'Shard not found');

        // Logic to "Mount" could involve pre-fetching warm cache or initializing audit-trail tracking
        return ResponseFactory.success(res, {
            message: `Shard ${shard.shardId} mounted. Ready for high-speed replay.`,
            meta: {
                collection: shard.collectionName,
                temporalRange: [shard.startTime, shard.endTime]
            }
        });
    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   GET /api/forensics/audit-proof/:transactionId
 * @desc    Get a ZK-Proof attestation for a specific transaction (Trustless Audit)
 * Issue #867: "Privacy-Preserving Audit" portal for external parties.
 */
router.get('/audit-proof/:transactionId', auth, async (req, res) => {
    try {
        const auditRepository = require('../repositories/auditRepository');
        const attestation = await auditRepository.getAttestation(req.params.transactionId);

        if (!attestation) {
            return ResponseFactory.error(res, 404, 'No ZK-Attestation found for this transaction. Try running the prover.');
        }

        const isValid = await auditRepository.verifyIntegrity(attestation._id);

        return ResponseFactory.success(res, {
            attestation,
            integrityVerified: isValid,
            auditContext: 'TRUSTLESS_PRIVACY_PRESERVING'
        });
    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

module.exports = router;
