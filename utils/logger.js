// Audit Logging Utility
const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, '../logs/access.log');

function log(message) {
  fs.appendFileSync(logFile, message + '\n');
}

function requestLogger(req, res, next) {
  const entry = `${new Date().toISOString()} ${req.method} ${req.path} user=${req.user ? req.user.id : 'anon'} risk=${req.riskScore || 0}`;
  log(entry);
  next();
}

module.exports = { log, requestLogger };
