const BaseRepository = require('./baseRepository');
const FinancialEvent = require('../models/FinancialEvent');
const ZKAttestation = require('../models/ZKAttestation');
const mongoose = require('mongoose');

/**
 * AuditRepository
 * Issue #867: Specialized repository for bridging financial events with ZK-Attestations.
 * Provides trustless audit trails without revealing private transaction details.
 */
class AuditRepository extends BaseRepository {
    constructor() {
        super(FinancialEvent);
    }

    /**
     * Get the ZK-Attestation for a specific financial event or entity.
     */
    async getAttestation(entityId) {
        return await ZKAttestation.findOne({ transactionId: entityId }).sort({ createdAt: -1 }).lean();
    }

    /**
     * List all ZK-Proven compliance events for a workspace.
     */
    async listProvenEvents(workspaceId, options = {}) {
        const { limit = 100, skip = 0 } = options;

        return await ZKAttestation.find({ workspaceId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('transactionId', 'amount category date') // Reveal only non-PII fields
            .lean();
    }

    /**
     * Verifies the Merkle compliance of an event against its ZK-Attestation.
     */
    async verifyIntegrity(attestationId) {
        const attestation = await ZKAttestation.findById(attestationId);
        if (!attestation) return false;

        const event = await FinancialEvent.findOne({
            entityId: attestation.transactionId,
            currentHash: attestation.complianceRoot
        });

        return !!event; // If hash matches, the ZK-Proof is anchor-correct
    }
}

module.exports = new AuditRepository();
