// rateLimiter.js
// Rate limiting middleware
const rateLimits = {};
const WINDOW_SIZE = 60000; // 1 minute
const MAX_REQUESTS = 100;

function rateLimiter(req, res, next) {
  const userId = req.user?.id || req.ip;
  const now = Date.now();
  if (!rateLimits[userId]) rateLimits[userId] = [];
  rateLimits[userId] = rateLimits[userId].filter(ts => now - ts < WINDOW_SIZE);
  if (rateLimits[userId].length >= MAX_REQUESTS) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  rateLimits[userId].push(now);
  next();
}

module.exports = { rateLimiter };
