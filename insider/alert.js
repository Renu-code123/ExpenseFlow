// Alerting and Reporting for Insider Threats
// Logs alerts, sends notifications, and generates reports

const fs = require('fs');
const path = require('path');
const ALERT_FILE = path.join(__dirname, 'alerts.log');

class AlertManager {
    logAlert(alert) {
        const entry = { ...alert, timestamp: new Date().toISOString() };
        fs.appendFileSync(ALERT_FILE, JSON.stringify(entry) + '\n');
    }

    getAlerts() {
        if (!fs.existsSync(ALERT_FILE)) return [];
        const lines = fs.readFileSync(ALERT_FILE, 'utf8').split('\n').filter(Boolean);
        return lines.map(line => JSON.parse(line));
    }

    sendNotification(alert) {
        // Placeholder: send email, SMS, webhook, etc.
        console.log('NOTIFICATION:', alert);
    }

    generateReport(filePath = 'insider-threat-report.json') {
        const alerts = this.getAlerts();
        const report = {
            generatedAt: new Date().toISOString(),
            alerts
        };
        fs.writeFileSync(path.join(__dirname, filePath), JSON.stringify(report, null, 2));
        console.log('Report generated:', filePath);
    }
}

module.exports = new AlertManager();
