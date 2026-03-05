// Data Retention & Deletion Dashboard (CLI)
// Displays policies, records, and deletion logs

const schedule = require('./schedule');
const deleter = require('./deleter');

function printDashboard() {
    console.log('--- Data Retention Dashboard ---');
    console.log('Policies:');
    console.log(schedule.getPolicies());
    console.log('Active Records:');
    console.log(schedule.getActiveRecords());
    console.log('Expired Records:');
    console.log(schedule.getExpiredRecords());
    console.log('Recent Deletion Logs:');
    const logs = deleter.getLogs().slice(-10);
    for (const log of logs) {
        console.log(log);
    }
}

printDashboard();
