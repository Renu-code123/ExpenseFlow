// behavioral-auth-ui.js
// CLI demo for Continuous Authentication Using Behavioral Biometrics

const ContinuousAuth = require('./continuous-auth');
const SessionManager = require('./session-manager');

function runBehavioralAuthDemo() {
    const userId = 'user123';
    const sessionManager = new SessionManager();
    const sessionId = sessionManager.createSession(userId);

    // Baseline patterns (simulate normal user behavior)
    const baselineKeystrokes = Array(20).fill().map((_, i) => ({ key: 'a', timestamp: Date.now() + i * 100 }));
    const baselineMouse = Array(20).fill().map((_, i) => ({ x: i * 10, y: i * 5, timestamp: Date.now() + i * 120 }));

    const continuousAuth = new ContinuousAuth();
    continuousAuth.startSession(sessionId, baselineKeystrokes, baselineMouse);

    // Simulate normal user activity
    baselineKeystrokes.forEach(event => continuousAuth.recordKeystroke(event));
    baselineMouse.forEach(event => continuousAuth.recordMouseMovement(event));

    // Simulate anomaly (sudden drop in activity)
    const anomalyKeystrokes = Array(5).fill().map((_, i) => ({ key: 'b', timestamp: Date.now() + i * 200 }));
    anomalyKeystrokes.forEach(event => continuousAuth.recordKeystroke(event));

    // Session status
    if (!continuousAuth.sessionActive) {
        sessionManager.terminateSession(sessionId);
        console.log('Session terminated due to anomaly.');
    } else {
        console.log('Session remains active.');
    }
}

runBehavioralAuthDemo();
