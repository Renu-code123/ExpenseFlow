// DLP Logger: Audit trail for DLP events
// ...existing code...
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'dlp-audit.log');

function logDLPEvent(event) {
    const entry = `${new Date().toISOString()} | ${event.action} | ${event.finding.type} | ${event.finding.match} | ${event.message}\n`;
    fs.appendFile(LOG_FILE, entry, err => {
        if (err) console.error('DLP Logger error:', err);
    });
}

module.exports = logDLPEvent;
