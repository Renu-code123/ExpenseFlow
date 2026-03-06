# Adaptive Rate Limiting API Reference

## Endpoints

### POST /test
- Description: Test endpoint for rate limiting
- Request Body: `{ "userId": "string" }`
- Response: `{ success: true, message: "Request allowed!" }` or `{ success: false, error: "Rate limit exceeded", limit, riskScore }`

## Middleware
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
- Run `dashboard.js` to view stats

## Alerts
- High risk users trigger alerts in `monitor.js` and `alerts.js`

## Admin
- Use `admin.js` for manual overrides

## Compliance
- All events logged in `rate-limit.log` for audit
