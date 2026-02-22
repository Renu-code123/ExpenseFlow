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
    async recordEvent(entityId, eventType, payload, userId) {
        // 1. Get the last event to chain the hash
        const lastEvent = await FinancialEvent.findOne({ entityId }).sort({ sequence: -1 });

        const sequence = lastEvent ? lastEvent.sequence + 1 : 1;
        const prevHash = lastEvent ? lastEvent.currentHash : 'GENESIS';

        // 2. Calculate cryptographic chain
        const currentHash = auditHash.calculateHash(prevHash, payload);
        const signature = auditHash.sign(currentHash);

        // 3. Create the event
        const event = await FinancialEvent.create({
            entityId,
            eventType,
            payload,
            sequence,
            prevHash,
            currentHash,
            signature,
            performedBy: userId,
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
}

module.exports = new LedgerService();
