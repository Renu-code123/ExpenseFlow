# Adaptive Rate Limiting System

This module implements adaptive rate limiting for API abuse prevention using real-time analytics and machine learning risk scoring. It dynamically adjusts user quotas based on behavior and risk profiles.

## Features
- Real-time analytics for API usage
- ML-based risk scoring
- Dynamic quota adjustment
- Logging and monitoring
- Easy integration with Express API routes

## File Structure
- `analytics.js`: Tracks requests, user actions, endpoint stats
- `ml-risk.js`: Scores user risk using ML/anomaly detection
- `quota.js`: Adjusts user quotas based on risk
- `logger.js`: Logs rate limiting events and statistics
- `rate-limiter.js`: Orchestrates all modules for adaptive rate limiting

## Usage Example
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

## Extensibility
- Add more sophisticated ML models in `ml-risk.js`
- Integrate with external monitoring tools via `logger.js`
- Customize quota logic in `quota.js`

## Compliance
All events are logged for audit and compliance purposes.
