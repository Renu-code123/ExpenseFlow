const FinancialEvent = require('../models/FinancialEvent');
const eventDiffEngine = require('../utils/eventDiffEngine');

/**
 * Event Processor Service
 * Issue #680: Orchestrates the creation and processing of immutable financial events.
 */
class EventProcessor {
    /**
     * Record a new event and optionally update a projection
     */
    async logEvent(userId, eventType, entity, oldState = null, options = {}) {
        const entityId = entity._id;
        const entityType = entity.constructor.modelName;

        // 1. Get previous event to link the chain
        const lastEvent = await FinancialEvent.findOne({ entityId }).sort({ version: -1 });
        const nextVersion = (lastEvent ? lastEvent.version : 0) + 1;

        // 2. Calculate delta if oldState is provided
        let payload = entity.toObject ? entity.toObject() : entity;
        if (oldState) {
            payload = {
                _isDelta: true,
                diff: eventDiffEngine.calculateDelta(oldState, payload)
            };
        }

        // 3. Create the event
        const event = new FinancialEvent({
            userId,
            eventType,
            entityType,
            entityId,
            payload,
            version: nextVersion,
            previousEventId: lastEvent ? lastEvent._id : null,
            metadata: {
                deviceId: options.deviceId || 'system',
                ipAddress: options.ipAddress,
                userAgent: options.userAgent,
                correlationId: options.correlationId || crypto.randomUUID?.()
            },
            checksum: eventDiffEngine.generateChecksum(payload, lastEvent ? lastEvent._id.toString() : null)
        });

        await event.save();

        // 4. In a real ES system, we would dispatch this to "Projections" here.
        // For this refactor, our Transaction model *is* the projection.
        return event;
    }

    /**
     * Verify the integrity of an entity's event chain
     */
    async verifyIntegrity(entityId) {
        const events = await FinancialEvent.find({ entityId }).sort({ version: 1 });

        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            const prevId = i > 0 ? events[i - 1]._id.toString() : null;

            const expectedChecksum = eventDiffEngine.generateChecksum(event.payload, prevId);
            if (event.checksum !== expectedChecksum) {
                return {
                    valid: false,
                    corruptedEventId: event._id,
                    reason: `Checksum mismatch at version ${event.version}`
                };
            }
        }

        return { valid: true };
    }
}

module.exports = new EventProcessor();
