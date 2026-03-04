const FinancialEvent = require('../models/FinancialEvent');
const auditHash = require('../utils/auditHash');

/**
 * Ledger Service
 * Issue #738: The brain for replaying events and maintaining ledger integrity.
 * Reconstructs entity state by replaying a stream of immutable events.
 */
class LedgerService {
    /**
     * Reconstruct the state of a transaction from its event stream
     */
    async reconstructState(entityId) {
        const events = await FinancialEvent.find({ entityId }).sort({ sequence: 1 });

        if (events.length === 0) return null;

        let state = {};

        for (const event of events) {
            // Verify integrity before processing
            const isValid = auditHash.verify(event.currentHash, event.signature);
            if (!isValid) {
                console.error(`[Ledger] CRITICAL: Integrity Violation for Event ${event._id}`);
                throw new Error('Ledger integrity compromised: Invalid event signature');
            }

            // Apply event payload to state
            state = { ...state, ...event.payload };

            // Handle special event types
            if (event.eventType === 'DELETED') {
                state.isDeleted = true;
            } else if (event.eventType === 'CREATED') {
                state.createdAt = event.timestamp;
            }

            state.lastModifiedAt = event.timestamp;
            state.lastEventSequence = event.sequence;
        }

        return state;
    }

    /**
     * Record a new event into the ledger
     */
    async recordEvent(entityId, eventType, payload, userId, workspaceId = null, parentEventId = null, entityType = 'TRANSACTION', forensicTraceId = null) {
        // 1. Get the last event to chain the hash
        const lastEvent = await FinancialEvent.findOne({ entityId }).sort({ sequence: -1 });

        const sequence = lastEvent ? lastEvent.sequence + 1 : 1;
        const prevHash = lastEvent ? lastEvent.currentHash : 'GENESIS';

        // 2. Calculate cryptographic chain
        const currentHash = auditHash.calculateHash(prevHash, payload);
        const signature = auditHash.sign(currentHash);

        // 3. Create the event
        const event = await FinancialEvent.create({
            entityId: entityId || new require('mongoose').Types.ObjectId(), // Handle virtual entities
            entityType,
            eventType,
            payload,
            sequence,
            prevHash,
            currentHash,
            signature,
            performedBy: userId || '507f1f77bcf86cd799439011', // System user fallback
            workspaceId,
            parentEventId,
            forensicTraceId,
            timestamp: new Date()
        });

        console.log(`[Ledger] New Event recorded: ${eventType} for ${entityId} (Seq: ${sequence})`);
        return event;
    }

    /**
     * Audit a complete chain for an entity
     */
    async auditChain(entityId) {
        const events = await FinancialEvent.find({ entityId }).sort({ sequence: 1 });
        let expectedPrevHash = 'GENESIS';

        for (const event of events) {
            if (event.prevHash !== expectedPrevHash) {
                return { valid: false, reason: `Chain broken at sequence ${event.sequence}`, sequence: event.sequence };
            }

            const hash = auditHash.calculateHash(event.prevHash, event.payload);
            if (hash !== event.currentHash) {
                return { valid: false, reason: `Hash mismatch at sequence ${event.sequence}`, sequence: event.sequence };
            }

            if (!auditHash.verify(event.currentHash, event.signature)) {
                return { valid: false, reason: `Signature invalid at sequence ${event.sequence}`, sequence: event.sequence };
            }

            expectedPrevHash = event.currentHash;
        }

        return { valid: true };
    }

    /**
     * Record a multi-sig approved event with proof chain
     * Issue #797: Chaining Multi-Sig proofs into the immutable ledger
     */
    async recordMultiSigEvent(entityId, eventType, payload, userId, workspaceId, multiSigProof) {
        const {
            operationId,
            signatures,
            quorumConfig,
            approvedAt
        } = multiSigProof;

        // Create aggregated signature proof
        const signatureProof = {
            operationId,
            quorumM: quorumConfig.m,
            quorumN: quorumConfig.n,
            signerCount: signatures.length,
            signers: signatures.map(sig => ({
                signerId: sig.signerId,
                proofType: sig.proofType,
                signatureHash: sig.signatureHash,
                signedAt: sig.signedAt
            })),
            aggregatedHash: this.calculateAggregatedSignatureHash(signatures),
            approvedAt
        };

        // Record the event with embedded multi-sig proof
        const event = await this.recordEvent(
            entityId,
            eventType,
            {
                ...payload,
                multiSigProof: signatureProof
            },
            userId,
            workspaceId,
            null, // parentEventId
            'MULTI_SIG_TRANSACTION'
        );

        console.log(`[Ledger] Multi-sig event recorded: ${eventType} for ${entityId} with ${signatures.length} signatures`);

        return event;
    }

    /**
     * Record a privacy-preserving aggregate event
     * Issue #844: Validating aggregate integrity via the Merkle Chain
     */
    async recordPrivacyAggregateEvent(workspaceId, aggregateData) {
        const payload = {
            anonymizedSum: aggregateData.anonymizedSum,
            count: aggregateData.count,
            field: aggregateData.field,
            method: 'DIFFERENTIAL_PRIVACY_NOISE',
            timestamp: aggregateData.timestamp
        };

        return this.recordEvent(
            new require('mongoose').Types.ObjectId(), // Virtual aggregate entity ID
            'PRIVACY_AGGREGATE',
            payload,
            'SYSTEM',
            workspaceId,
            null,
            'PRIVACY_BRIDGE'
        );
    }

    /**
     * Calculate aggregated hash from multiple signatures
     */
    calculateAggregatedSignatureHash(signatures) {
        const crypto = require('crypto');

        // Sort signatures by signer ID for deterministic ordering
        const sorted = [...signatures].sort((a, b) =>
            a.signerId.toString().localeCompare(b.signerId.toString())
        );

        // Create merkle root of signature hashes
        let leaves = sorted.map(sig =>
            crypto.createHash('sha256').update(sig.signatureHash || '').digest('hex')
        );

        while (leaves.length > 1) {
            const nextLevel = [];
            for (let i = 0; i < leaves.length; i += 2) {
                const left = leaves[i];
                const right = leaves[i + 1] || left;
                nextLevel.push(
                    crypto.createHash('sha256').update(left + right).digest('hex')
                );
            }
            leaves = nextLevel;
        }

        return leaves[0] || 'EMPTY';
    }

    /**
     * Verify multi-sig proof in a ledger event
     */
    async verifyMultiSigProof(eventId) {
        const event = await FinancialEvent.findById(eventId);

        if (!event || !event.payload?.multiSigProof) {
            return { valid: false, reason: 'No multi-sig proof found' };
        }

        const proof = event.payload.multiSigProof;

        // Verify quorum was met
        if (proof.signerCount < proof.quorumM) {
            return { valid: false, reason: 'Quorum not met' };
        }

        // Verify aggregated hash
        const expectedHash = this.calculateAggregatedSignatureHash(proof.signers);
        if (expectedHash !== proof.aggregatedHash) {
            return { valid: false, reason: 'Aggregated signature hash mismatch' };
        }
        return {
            valid: true,
            operationId: proof.operationId,
            signerCount: proof.signerCount,
            quorumConfig: { m: proof.quorumM, n: proof.quorumN }
        };
    }

    /**
     * Record a financial event with genetic money lineage DNA.
     * Issue #866: Tracks 'Source-DNA' provenance in the immutable ledger.
     */
    async recordLineageEvent(entityId, eventType, payload, userId, workspaceId, lineageFragments) {
        const crypto = require('crypto');

        // Calculate a combined lineage provenance hash from all fragments
        const lineageData = lineageFragments.map(f => `${f.sourceDna}:${f.provenanceHash}:${f.amountContributed}`).join('|');
        const lineageProvenanceHash = crypto.createHash('sha256').update(lineageData).digest('hex');

        return this.recordEvent(
            entityId,
            eventType,
            {
                ...payload,
                lineageProvenanceHash,
                fragments: lineageFragments
            },
            userId,
            workspaceId,
            null,
            'LINEAGE_TRACKED_TRANSACTION'
        );
    }
}

module.exports = new LedgerService();
