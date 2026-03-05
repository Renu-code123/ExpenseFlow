// Compliance Logger Utility
// Logs compliance-relevant events for audit trails
const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, '../logs/compliance.log');

function log(message) {
  fs.appendFileSync(logFile, message + '\n');
}

function complianceEventLogger(event) {
  const entry = `${new Date().toISOString()} ${JSON.stringify(event)}`;
  log(entry);
}

module.exports = { log, complianceEventLogger };
