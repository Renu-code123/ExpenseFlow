// anomaly-detector.js
// Detects anomalies in user behavior for continuous authentication

class AnomalyDetector {
    constructor() {
        this.keystrokeBaseline = [];
        this.mouseBaseline = [];
    }

    setBaseline(keystrokePatterns, mousePatterns) {
        this.keystrokeBaseline = keystrokePatterns;
        this.mouseBaseline = mousePatterns;
    }

    detectKeystrokeAnomaly(currentPatterns) {
        // Simple anomaly detection: compare length and timing
        if (currentPatterns.length < this.keystrokeBaseline.length * 0.5) return true;
        // Advanced: compare timing, sequence, etc.
        return false;
    }

    detectMouseAnomaly(currentPatterns) {
        // Simple anomaly detection: compare movement frequency
        if (currentPatterns.length < this.mouseBaseline.length * 0.5) return true;
        // Advanced: compare speed, direction, etc.
        return false;
    }

    detectAnomaly(currentKeystrokes, currentMouse) {
        return this.detectKeystrokeAnomaly(currentKeystrokes) || this.detectMouseAnomaly(currentMouse);
    }
}

module.exports = AnomalyDetector;
