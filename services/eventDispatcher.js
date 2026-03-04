/**
 * Event Dispatcher Service
 * Issue #628: Transaction Processing Pipeline Refactor
 * Handles cross-cutting concerns like Budget updates and Goal tracking
 */

class EventDispatcher {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * Subscribe to an event
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Emit an event and trigger all listeners
     */
    async emit(event, data) {
        const callbacks = this.listeners.get(event) || [];
        const results = [];

        for (const callback of callbacks) {
            try {
                results.push(await callback(data));
            } catch (error) {
                console.error(`[EventDispatcher] Error in listener for ${event}:`, error);
            }
        }
        return results;
    }
}

// Global instance for the application
module.exports = new EventDispatcher();
