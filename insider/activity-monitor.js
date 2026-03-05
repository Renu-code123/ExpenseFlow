// Real-Time User Activity Monitor
// Tracks user actions, session events, and resource access

class ActivityMonitor {
    constructor() {
        this.userActivities = new Map(); // userId -> [activity]
        this.sessionEvents = new Map(); // sessionId -> [event]
        this.resourceAccess = new Map(); // resourceId -> [userId]
    }

    recordActivity(userId, activity) {
        if (!this.userActivities.has(userId)) {
            this.userActivities.set(userId, []);
        }
        this.userActivities.get(userId).push({ ...activity, timestamp: Date.now() });
    }

    recordSessionEvent(sessionId, event) {
        if (!this.sessionEvents.has(sessionId)) {
            this.sessionEvents.set(sessionId, []);
        }
        this.sessionEvents.get(sessionId).push({ ...event, timestamp: Date.now() });
    }

    recordResourceAccess(resourceId, userId) {
        if (!this.resourceAccess.has(resourceId)) {
            this.resourceAccess.set(resourceId, []);
        }
        this.resourceAccess.get(resourceId).push({ userId, timestamp: Date.now() });
    }

    getUserActivities(userId) {
        return this.userActivities.get(userId) || [];
    }

    getSessionEvents(sessionId) {
        return this.sessionEvents.get(sessionId) || [];
    }

    getResourceAccess(resourceId) {
        return this.resourceAccess.get(resourceId) || [];
    }

    getAllActivities() {
        return Array.from(this.userActivities.entries());
    }
}

module.exports = new ActivityMonitor();
