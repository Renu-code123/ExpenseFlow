const crypto = require('crypto');

/**
 * Audit Hasher Utility
 * Provides cryptographic integrity verification for audit logs
 */
class AuditHasher {
    /**
     * Generate hash for audit log entry
     */
    generateHash(logData, previousHash = '') {
        const data = {
            timestamp: logData.timestamp,
            userId: logData.userId,
            action: logData.action,
            entityType: logData.entityType,
            entityId: logData.entityId,
            changes: logData.changes,
            previousHash
        };

        const dataString = JSON.stringify(data);
        return crypto.createHash('sha256').update(dataString).digest('hex');
    }

    /**
     * Verify integrity of audit log chain
     */
    async verifyChain(logs) {
        if (!logs || logs.length === 0) {
            return { valid: true, errors: [] };
        }

        const errors = [];

        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            const previousHash = i > 0 ? logs[i - 1].hash : '';

            const expectedHash = this.generateHash(log, previousHash);

            if (log.hash !== expectedHash) {
                errors.push({
                    logId: log.logId,
                    index: i,
                    message: 'Hash mismatch - possible tampering detected',
                    expected: expectedHash,
                    actual: log.hash
                });
            }

            if (i > 0 && log.previousHash !== logs[i - 1].hash) {
                errors.push({
                    logId: log.logId,
                    index: i,
                    message: 'Chain broken - previous hash mismatch',
                    expected: logs[i - 1].hash,
                    actual: log.previousHash
                });
            }
        }

        return {
            valid: errors.length === 0,
            totalLogs: logs.length,
            errors
        };
    }

    /**
     * Generate integrity report hash
     */
    generateReportHash(reportData) {
        const dataString = JSON.stringify(reportData);
        return crypto.createHash('sha256').update(dataString).digest('hex');
    }

    /**
     * Encrypt sensitive data
     */
    encryptData(data, key) {
        const algorithm = 'aes-256-cbc';
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);

        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        return {
            iv: iv.toString('hex'),
            data: encrypted
        };
    }

    /**
     * Decrypt sensitive data
     */
    decryptData(encryptedData, key) {
        const algorithm = 'aes-256-cbc';
        const decipher = crypto.createDecipheriv(
            algorithm,
            Buffer.from(key, 'hex'),
            Buffer.from(encryptedData.iv, 'hex')
        );

        let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
    }
}

module.exports = new AuditHasher();
