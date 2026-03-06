// Example usage scenarios for Data Retention & Deletion
const orchestrator = require('./retention-orchestrator');

// Scenario 1: Add policy and records
orchestrator.addPolicy('transaction', 365, 'transactions');
orchestrator.addRecord('txnA', 'transaction', Date.now() - 400 * 86400000);
orchestrator.addRecord('txnB', 'transaction', Date.now() - 100 * 86400000);

// Scenario 2: Enforce retention
orchestrator.enforceRetention();

// Scenario 3: View logs
console.log('Deletion logs:', orchestrator.getLogs().slice(-2));
