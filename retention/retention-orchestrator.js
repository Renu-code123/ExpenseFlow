// Automated Data Retention & Deletion Orchestrator
// Integrates schedule management, secure deletion, and compliance logging

const schedule = require('./schedule');
const deleter = require('./deleter');

class RetentionOrchestrator {
    enforceRetention() {
        const expired = schedule.getExpiredRecords();
        expired.forEach(record => {
            deleter.deleteRecord(record);
        });
    }

    addPolicy(type, durationDays, appliesTo) {
        schedule.addPolicy(type, durationDays, appliesTo);
    }

    addRecord(id, type, createdAt) {
        schedule.addRecord(id, type, createdAt);
    }

    getPolicies() {
        return schedule.getPolicies();
    }

    getLogs() {
        return deleter.getLogs();
    }
}

module.exports = new RetentionOrchestrator();
