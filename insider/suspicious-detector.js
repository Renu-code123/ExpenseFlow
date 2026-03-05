// Suspicious Activity Detection Logic
// Flags anomalous, risky, or policy-violating actions

class SuspiciousDetector {
    constructor() {
        this.rules = [
            this.ruleHighVolumeAccess,
            this.ruleOffHoursAccess,
            this.ruleSensitiveResourceAccess,
            this.ruleFailedLoginAttempts,
            this.ruleUnusualSessionDuration
        ];
    }

    analyzeActivity(userId, activities) {
        let alerts = [];
        for (const rule of this.rules) {
            const result = rule(userId, activities);
            if (result) alerts.push(result);
        }
        return alerts;
    }

    ruleHighVolumeAccess(userId, activities) {
        // Flag if user accesses >100 resources in 1 hour
        const now = Date.now();
        const recent = activities.filter(a => now - a.timestamp < 3600000);
        if (recent.length > 100) {
            return { type: 'HighVolumeAccess', userId, count: recent.length };
        }
        return null;
    }

    ruleOffHoursAccess(userId, activities) {
        // Flag access between 12am-5am
        for (const a of activities) {
            const hour = new Date(a.timestamp).getHours();
            if (hour >= 0 && hour < 5) {
                return { type: 'OffHoursAccess', userId, timestamp: a.timestamp };
            }
        }
        return null;
    }

    ruleSensitiveResourceAccess(userId, activities) {
        // Flag access to resources marked 'sensitive'
        for (const a of activities) {
            if (a.resource && a.resource.sensitive) {
                return { type: 'SensitiveResourceAccess', userId, resource: a.resource.id };
            }
        }
        return null;
    }

    ruleFailedLoginAttempts(userId, activities) {
        // Flag >5 failed logins in 10 minutes
        const now = Date.now();
        const failed = activities.filter(a => a.type === 'login' && a.status === 'fail' && now - a.timestamp < 600000);
        if (failed.length > 5) {
            return { type: 'FailedLoginAttempts', userId, count: failed.length };
        }
        return null;
    }

    ruleUnusualSessionDuration(userId, activities) {
        // Flag sessions longer than 8 hours
        const sessions = activities.filter(a => a.type === 'session' && a.duration > 8 * 3600 * 1000);
        if (sessions.length > 0) {
            return { type: 'UnusualSessionDuration', userId, sessions: sessions.length };
        }
        return null;
    }
}

module.exports = new SuspiciousDetector();
