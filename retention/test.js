// Test suite for Automated Data Retention & Deletion
const orchestrator = require('./retention-orchestrator');

function runTests() {
    console.log('Test: Add policy and record');
    orchestrator.addPolicy('transaction', 365, 'transactions');
    orchestrator.addRecord('txn1', 'transaction', Date.now() - 400 * 86400000);
    orchestrator.addRecord('txn2', 'transaction', Date.now() - 100 * 86400000);
    console.log('Policies:', orchestrator.getPolicies());

    console.log('Test: Enforce retention');
    orchestrator.enforceRetention();
    console.log('Deletion logs:', orchestrator.getLogs().slice(-2));
}

runTests();
