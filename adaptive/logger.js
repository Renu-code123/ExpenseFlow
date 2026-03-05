// Logging and Monitoring for Rate Limiting
// Tracks events, alerts, and statistics

const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(__dirname, 'rate-limit.log');

class RateLimitLogger {
    log(event, details) {
        const entry = {
            timestamp: new Date().toISOString(),
            event,
            details
        };
        fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    }

    getLogs() {
        if (!fs.existsSync(LOG_FILE)) return [];
        const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
        return lines.map(line => JSON.parse(line));
    }

    queryLogs(filterFn) {
        return this.getLogs().filter(filterFn);
    }
}

module.exports = new RateLimitLogger();
