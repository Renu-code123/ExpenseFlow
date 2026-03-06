# Automated Data Retention & Deletion Documentation

## Overview
This module enforces data retention schedules and securely deletes expired records for privacy law compliance (GDPR, CCPA, etc.).

## Modules
- **schedule.js**: Tracks retention policies and record expiry
- **deleter.js**: Securely deletes expired records and logs actions
- **retention-orchestrator.js**: Orchestrates enforcement

## Integration
Add retention enforcement to your API:
```js
const orchestrator = require('./retention/retention-orchestrator');
app.post('/enforce', (req, res) => {
    orchestrator.enforceRetention();
    res.json({ success: true });
});
```

## Dashboard
Run `dashboard.js` to view policies, records, and logs.

## Testing
Run `test.js` for a basic test suite.

## Compliance
All deletions are logged for audit and compliance.
