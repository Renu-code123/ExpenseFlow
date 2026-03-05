# Insider Threat Detection & Response Documentation

## Overview
This module provides real-time monitoring, detection, and response for insider threats. It tracks user activities, flags suspicious behavior, and automates containment actions.

## Modules
- **activity-monitor.js**: Tracks user actions, sessions, resource access
- **suspicious-detector.js**: Detects suspicious activities using rules
- **containment.js**: Executes containment actions
- **alert.js**: Logs alerts, sends notifications, generates reports
- **insider-orchestrator.js**: Orchestrates detection and response

## Integration
Add activity monitoring to your API:
```js
const orchestrator = require('./insider/insider-orchestrator');
app.post('/activity', (req, res) => {
    const { userId, activity } = req.body;
    orchestrator.monitorUser(userId, activity);
    res.json({ success: true });
});
```

## Dashboard
Run `dashboard.js` to view activities and alerts.

## Testing
Run `test.js` for a basic test suite.

## Extending
- Add more detection rules in `suspicious-detector.js`
- Integrate external alerting in `alert.js`
- Customize containment logic in `containment.js`

## Compliance
All alerts and actions are logged for audit and compliance.
