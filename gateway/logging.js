// logging.js
// Logging and audit middleware
function logRequest(req, res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} by ${req.user?.id || req.ip}`);
  next();
}

module.exports = { logRequest };
