// session-manager.js
// Manages user sessions and handles re-authentication

class SessionManager {
    constructor() {
        this.sessions = {};
    }

    createSession(userId) {
        const sessionId = `${userId}-${Date.now()}`;
        this.sessions[sessionId] = { userId, active: true };
        return sessionId;
    }

    terminateSession(sessionId) {
        if (this.sessions[sessionId]) {
            this.sessions[sessionId].active = false;
        }
    }

    isSessionActive(sessionId) {
        return this.sessions[sessionId] && this.sessions[sessionId].active;
    }

    reauthenticate(sessionId) {
        if (this.sessions[sessionId]) {
            this.sessions[sessionId].active = true;
            console.log(`Session ${sessionId} re-authenticated.`);
        }
    }
}

module.exports = SessionManager;
