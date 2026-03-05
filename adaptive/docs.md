# Adaptive Rate Limiting Documentation

## Overview
Adaptive rate limiting prevents API abuse by dynamically adjusting quotas based on user behavior and risk profiles. It uses real-time analytics and machine learning to detect anomalies and enforce limits.

## Modules
- **analytics.js**: Tracks API usage, user actions, endpoint stats
- **ml-risk.js**: Scores user risk using ML/anomaly detection
- **quota.js**: Adjusts quotas based on risk
- **logger.js**: Logs events for monitoring and compliance
- **rate-limiter.js**: Orchestrates all modules

## Integration
Add the middleware to your Express routes:
```js
const rateLimiter = require('./adaptive/rate-limiter');
function rateLimitMiddleware(req, res, next) {
  const userId = req.body.userId || req.ip;
  const endpoint = req.path;
  rateLimiter.recordRequest(userId, endpoint, 'success');
  if (!rateLimiter.isAllowed(userId)) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded', limit: rateLimiter.getUserLimit(userId), riskScore: rateLimiter.getUserRiskScore(userId) });
  }
  next();
}
```

## Dashboard
Run `dashboard.js` to view user stats, risk scores, quotas, and logs.

## Testing
Run `test.js` for a basic test suite.

## Extending
- Enhance ML logic in `ml-risk.js`
- Integrate external monitoring in `logger.js`
- Customize quota logic in `quota.js`

## Compliance
All rate limiting events are logged for audit and compliance.
