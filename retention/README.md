# Automated Data Retention & Deletion

## Overview
This module enforces data retention schedules and securely deletes expired records to ensure compliance with privacy laws (GDPR, CCPA, etc.).

## Features
- Retention schedule management
- Secure deletion of expired records
- Compliance logging and reporting
- Orchestrator for workflow integration

## File Structure
- `schedule.js`: Tracks retention policies and record expiry
- `deleter.js`: Securely deletes expired records and logs actions
- `retention-orchestrator.js`: Integrates all modules for enforcement

## Usage Example
```js
const orchestrator = require('./retention/retention-orchestrator');

// Add retention policy
orchestrator.addPolicy('transaction', 365, 'transactions');

// Add record
orchestrator.addRecord('txn123', 'transaction', Date.now() - 400 * 86400000);

// Enforce retention (delete expired)
orchestrator.enforceRetention();
```

## Compliance
All deletions are logged for audit and compliance.
