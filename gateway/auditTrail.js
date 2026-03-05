// auditTrail.js
// Audit trail and event logging for API Gateway
const fs = require('fs');
const AUDIT_FILE = 'gateway/audit.log';

function logAudit(event, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    details
  };
  fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
}

function getAuditTrail() {
  if (!fs.existsSync(AUDIT_FILE)) return [];
  return fs.readFileSync(AUDIT_FILE, 'utf-8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

module.exports = { logAudit, getAuditTrail };
