// Example usage scenarios for Insider Threat Detection
const orchestrator = require('./insider-orchestrator');

function simulateScenario(userId, activities) {
    activities.forEach(activity => {
        orchestrator.monitorUser(userId, activity);
        console.log(`User: ${userId}, Activity: ${JSON.stringify(activity)}`);
    });
}

// Scenario 1: High volume access
simulateScenario('userA', Array(120).fill({ type: 'access', resource: { id: 'fileX', sensitive: false } }));

// Scenario 2: Off-hours access
simulateScenario('userB', [{ type: 'access', resource: { id: 'fileY', sensitive: false }, timestamp: new Date('2026-03-05T03:00:00Z').getTime() }]);

// Scenario 3: Sensitive resource access
simulateScenario('userC', [{ type: 'access', resource: { id: 'fileZ', sensitive: true } }]);

// Scenario 4: Failed login attempts
simulateScenario('userD', Array(7).fill({ type: 'login', status: 'fail', sessionId: 'sessD' }));

// Scenario 5: Unusual session duration
simulateScenario('userE', [{ type: 'session', duration: 9 * 3600 * 1000, sessionId: 'sessE' }]);
