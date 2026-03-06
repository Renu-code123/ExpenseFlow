// Insider Threat Detection Dashboard (CLI)
// Displays user activities, alerts, and containment actions

const activityMonitor = require('./activity-monitor');
const alertManager = require('./alert');

function printDashboard() {
    console.log('--- Insider Threat Detection Dashboard ---');
    console.log('User Activities:');
    for (const [userId, activities] of activityMonitor.getAllActivities()) {
        console.log(`User: ${userId}`);
        activities.forEach(a => console.log('  ', a));
        console.log('---');
    }
    console.log('Recent Alerts:');
    const alerts = alertManager.getAlerts().slice(-10);
    for (const alert of alerts) {
        console.log(alert);
    }
}

printDashboard();
