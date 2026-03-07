// continuous-auth.js
// Integrates behavioral biometrics and anomaly detection for continuous authentication

const BehavioralBiometricsEngine = require('./behavioral-biometrics-engine');
const AnomalyDetector = require('./anomaly-detector');

class ContinuousAuth {
    constructor() {
        this.engine = new BehavioralBiometricsEngine();
        this.detector = new AnomalyDetector();
        this.sessionActive = false;
    }

    startSession(sessionId, baselineKeystrokes, baselineMouse) {
        this.engine.startSession(sessionId);
        this.detector.setBaseline(baselineKeystrokes, baselineMouse);
        this.sessionActive = true;
    }

    recordKeystroke(event) {
        this.engine.recordKeystroke(event);
        this.checkForAnomaly();
    }

    recordMouseMovement(event) {
        this.engine.recordMouseMovement(event);
        this.checkForAnomaly();
    }

    checkForAnomaly() {
        const keystrokes = this.engine.getKeystrokePatterns();
        const mouse = this.engine.getMousePatterns();
        if (this.detector.detectAnomaly(keystrokes, mouse)) {
            this.triggerReauthentication();
        }
    }

    triggerReauthentication() {
        this.sessionActive = false;
        console.log('Anomaly detected! Triggering re-authentication or session termination.');
    }
}

module.exports = ContinuousAuth;
