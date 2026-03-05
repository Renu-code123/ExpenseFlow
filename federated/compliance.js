// Compliance Logging and Audit Trail
// Tracks data access, model updates, user actions

const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(__dirname, 'audit.log');

function log(action, details) {
    const entry = {
        timestamp: new Date().toISOString(),
        action,
        details
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

function getLogs() {
    if (!fs.existsSync(LOG_FILE)) return [];
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
    return lines.map(line => JSON.parse(line));
}

function queryLogs(filterFn) {
    return getLogs().filter(filterFn);
}

module.exports = {
    log,
    getLogs,
    queryLogs
};
