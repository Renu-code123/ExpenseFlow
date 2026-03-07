// behavioral-biometrics-engine.js
// Monitors user keystrokes and mouse movements for continuous authentication

class BehavioralBiometricsEngine {
    constructor() {
        this.keystrokePatterns = [];
        this.mousePatterns = [];
        this.sessionId = null;
    }

    startSession(sessionId) {
        this.sessionId = sessionId;
        this.keystrokePatterns = [];
        this.mousePatterns = [];
    }

    recordKeystroke(event) {
        // event: { key, timestamp }
        this.keystrokePatterns.push(event);
    }

    recordMouseMovement(event) {
        // event: { x, y, timestamp }
        this.mousePatterns.push(event);
    }

    getKeystrokePatterns() {
        return this.keystrokePatterns;
    }

    getMousePatterns() {
        return this.mousePatterns;
    }
}

module.exports = BehavioralBiometricsEngine;
