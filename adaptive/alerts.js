// Alerting utility for Adaptive Rate Limiting
// Sends notifications for high risk events

const logger = require('./logger');
const config = require('./config');

function checkAlerts() {
    const logs = logger.getLogs();
    logs.forEach(entry => {
        if (entry.event === 'request' && entry.details.riskScore > config.alertRiskThreshold) {
            sendAlert(entry.details);
        }
    });
}

function sendAlert(details) {
    // Placeholder: send email, SMS, webhook, etc.
    console.log('ALERT: High risk user detected!', details);
}

module.exports = {
    checkAlerts,
    sendAlert
};
