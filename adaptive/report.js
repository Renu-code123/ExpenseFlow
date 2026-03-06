// Report generator for Adaptive Rate Limiting
// Creates usage, risk, and quota reports for compliance

const stats = require('./stats');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

function generateReport(filePath = 'adaptive-rate-report.json') {
    const summary = stats.getSummary();
    const logs = logger.getLogs();
    const report = {
        generatedAt: new Date().toISOString(),
        summary,
        logs
    };
    fs.writeFileSync(path.join(__dirname, filePath), JSON.stringify(report, null, 2));
    console.log('Report generated:', filePath);
}

module.exports = {
    generateReport
};
