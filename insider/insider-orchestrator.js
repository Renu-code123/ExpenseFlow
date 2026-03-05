// Insider Threat Detection Orchestrator
// Integrates monitoring, detection, containment, and alerting

const activityMonitor = require('./activity-monitor');
const suspiciousDetector = require('./suspicious-detector');
const containment = require('./containment');
const alertManager = require('./alert');

class InsiderThreatOrchestrator {
    monitorUser(userId, activity) {
        activityMonitor.recordActivity(userId, activity);
        const activities = activityMonitor.getUserActivities(userId);
        const alerts = suspiciousDetector.analyzeActivity(userId, activities);
        alerts.forEach(alert => {
            alertManager.logAlert(alert);
            alertManager.sendNotification(alert);
            this.handleAlert(alert, userId, activity);
        });
    }

    handleAlert(alert, userId, activity) {
        switch (alert.type) {
            case 'HighVolumeAccess':
                containment.lockAccount(userId);
                containment.sendAlert(alert);
                break;
            case 'OffHoursAccess':
                containment.terminateSession(activity.sessionId);
                containment.sendAlert(alert);
                break;
            case 'SensitiveResourceAccess':
                containment.isolateResource(alert.resource);
                containment.sendAlert(alert);
                break;
            case 'FailedLoginAttempts':
                containment.lockAccount(userId);
                containment.sendAlert(alert);
                break;
            case 'UnusualSessionDuration':
                containment.terminateSession(activity.sessionId);
                containment.sendAlert(alert);
                break;
            default:
                containment.sendAlert(alert);
        }
    }

    generateReport(filePath) {
        alertManager.generateReport(filePath);
    }

    getAlerts() {
        return alertManager.getAlerts();
    }
}

module.exports = new InsiderThreatOrchestrator();
