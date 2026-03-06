// Data Retention Schedule Management
// Tracks retention policies, record expiry, and schedules

class RetentionSchedule {
    constructor() {
        this.policies = []; // { type, durationDays, appliesTo }
        this.records = []; // { id, type, createdAt, expiresAt }
    }

    addPolicy(type, durationDays, appliesTo) {
        this.policies.push({ type, durationDays, appliesTo });
    }

    addRecord(id, type, createdAt) {
        const policy = this.policies.find(p => p.type === type);
        if (!policy) throw new Error('No retention policy for type: ' + type);
        const expiresAt = new Date(createdAt).getTime() + policy.durationDays * 86400000;
        this.records.push({ id, type, createdAt, expiresAt });
    }

    getExpiredRecords(now = Date.now()) {
        return this.records.filter(r => now > r.expiresAt);
    }

    getActiveRecords(now = Date.now()) {
        return this.records.filter(r => now <= r.expiresAt);
    }

    getPolicies() {
        return this.policies;
    }
}

module.exports = new RetentionSchedule();
