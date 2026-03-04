const EventEmitter = require('events');
const logger = require('./structuredLogger');

/**
 * Centralized Application Event Bus
 * Issue #711: Decouples service communication using an asynchronous event-driven pattern.
 */
class AppEventBus extends EventEmitter {
    constructor() {
        super();
        this.name = 'AppEventBus';

        // Track stats for telemetry
        this.eventCount = 0;
        this.errorCount = 0;
    }

    /**
     * Enhanced emit with logging and telemetry
     */
    publish(event, payload) {
        this.eventCount++;

        logger.debug(`[${this.name}] Publishing event: ${event}`, {
            event,
            payloadType: typeof payload
        });

        // Use standard emit
        return this.emit(event, payload);
    }

    /**
     * Enhanced subscribe with error boundary
     */
    subscribe(event, listener) {
        const safeListener = async (payload) => {
            try {
                await listener(payload);
            } catch (err) {
                this.errorCount++;
                logger.error(`[${this.name}] Listener failure for event: ${event}`, {
                    event,
                    error: err.message,
                    stack: err.stack
                });
            }
        };

        this.on(event, safeListener);
    }

    getMetrics() {
        return {
            totalEvents: this.eventCount,
            totalErrors: this.errorCount,
            activeListeners: this.eventNames().length
        };
    }
}

// Export a singleton instance
module.exports = new AppEventBus();
