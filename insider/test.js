// Test suite for Insider Threat Detection
const orchestrator = require('./insider-orchestrator');

function runTests() {
    console.log('Test: High volume access');
    for (let i = 0; i < 120; i++) {
        orchestrator.monitorUser('user1', { type: 'access', resource: { id: 'fileA', sensitive: false } });
    }
    console.log('Alerts:', orchestrator.getAlerts().slice(-2));

    console.log('Test: Off-hours access');
    orchestrator.monitorUser('user2', { type: 'access', resource: { id: 'fileB', sensitive: false }, timestamp: new Date('2026-03-05T02:00:00Z').getTime() });
    console.log('Alerts:', orchestrator.getAlerts().slice(-1));

    console.log('Test: Sensitive resource access');
    orchestrator.monitorUser('user3', { type: 'access', resource: { id: 'fileC', sensitive: true } });
    console.log('Alerts:', orchestrator.getAlerts().slice(-1));

    console.log('Test: Failed login attempts');
    for (let i = 0; i < 7; i++) {
        orchestrator.monitorUser('user4', { type: 'login', status: 'fail', sessionId: 'sess2' });
    }
    console.log('Alerts:', orchestrator.getAlerts().slice(-1));

    console.log('Test: Unusual session duration');
    orchestrator.monitorUser('user5', { type: 'session', duration: 9 * 3600 * 1000, sessionId: 'sess3' });
    console.log('Alerts:', orchestrator.getAlerts().slice(-1));

    // Generate report
    orchestrator.generateReport('test-insider-report.json');
}

runTests();
