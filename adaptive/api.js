// Adaptive Rate Limiting API Integration Example
const express = require('express');
const app = express();
const rateLimiter = require('./rate-limiter');

app.use(express.json());

function rateLimitMiddleware(req, res, next) {
    const userId = req.body.userId || req.ip;
    const endpoint = req.path;
    rateLimiter.recordRequest(userId, endpoint, 'success');
    if (!rateLimiter.isAllowed(userId)) {
        return res.status(429).json({ success: false, error: 'Rate limit exceeded', limit: rateLimiter.getUserLimit(userId), riskScore: rateLimiter.getUserRiskScore(userId) });
    }
    next();
}

app.use(rateLimitMiddleware);

app.post('/test', (req, res) => {
    res.json({ success: true, message: 'Request allowed!' });
});

app.listen(4000, () => {
    console.log('Adaptive Rate Limiting API running on port 4000');
});
