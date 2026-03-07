// DLP Test: Unit tests for DLP engine
// ...existing code...

const DLPEngine = require('./dlp-engine');
const dlpConfig = require('./dlp-config');

const engine = new DLPEngine(dlpConfig);

function testScanData() {
    const testData = 'User email: test@example.com, SSN: 123-45-6789, Card: 4111 1111 1111 1111';
    const findings = engine.scanData(testData);
    console.log('Findings:', findings);
}

function testEvaluatePolicies() {
    const findings = [
        { type: 'email', match: ['test@example.com'], severity: 'high' },
        { type: 'ssn', match: ['123-45-6789'], severity: 'high' },
    ];
    const actions = engine.evaluatePolicies(findings);
    console.log('Actions:', actions);
}

testScanData();
testEvaluatePolicies();
