# Real-Time Insider Threat Detection & Response

## Overview
This module monitors user behavior, flags suspicious activities, and triggers automated containment actions to mitigate insider threats in real time.

## Features
- Real-time user activity monitoring
- Suspicious activity detection (rules-based)
- Automated containment (account lock, session termination, resource isolation)
- Alerting and reporting (log, notification, report generation)
- Orchestrator for integration and workflow

## File Structure
- `activity-monitor.js`: Tracks user actions, sessions, resource access
- `suspicious-detector.js`: Flags suspicious activities using rules
- `containment.js`: Executes automated containment actions
- `alert.js`: Logs alerts, sends notifications, generates reports
- `insider-orchestrator.js`: Integrates all modules for detection and response

## Usage Example
```js
const orchestrator = require('./insider/insider-orchestrator');

// Monitor user activity
orchestrator.monitorUser('user123', { type: 'login', status: 'fail', sessionId: 'sess1' });

// Generate report
orchestrator.generateReport('insider-threat-report.json');
```

## Extending
- Add more detection rules in `suspicious-detector.js`
- Integrate with external alerting systems in `alert.js`
- Customize containment logic in `containment.js`

## Compliance
All alerts and actions are logged for audit and compliance.
