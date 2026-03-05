// Monitoring utility for Adaptive Rate Limiting
// Watches log file for alerts and anomalies

const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(__dirname, 'rate-limit.log');

function watchLogs() {
    fs.watchFile(LOG_FILE, { interval: 1000 }, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
            const logs = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
            const lastLog = logs[logs.length - 1];
            if (lastLog) {
                const entry = JSON.parse(lastLog);
                if (entry.event === 'request' && entry.details.riskScore > 100) {
                    console.log('ALERT: High risk user detected:', entry.details);
                }
            }
        }
    });
    console.log('Monitoring rate-limit.log for alerts...');
}

watchLogs();
