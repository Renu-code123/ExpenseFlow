const AuditLog = require('../models/AuditLog');
const auditHasher = require('../utils/auditHasher');

/**
 * Audit Logger Middleware
 * Automatically captures audit events for all requests
 */
class AuditLogger {
    /**
     * Main middleware function
     */
    middleware() {
        return async (req, res, next) => {
            // Skip audit for certain routes
            if (this.shouldSkipAudit(req.path)) {
                return next();
            }

            // Capture original methods
            const originalJson = res.json;
            const originalSend = res.send;

            // Store request start time
            req.auditStartTime = Date.now();

            // Override response methods to capture audit data
            res.json = function (data) {
                res.locals.responseData = data;
                return originalJson.call(this, data);
            };

            res.send = function (data) {
                res.locals.responseData = data;
                return originalSend.call(this, data);
            };

            // Capture response
            res.on('finish', async () => {
                try {
                    await this.logAudit(req, res);
                } catch (err) {
                    console.error('[AuditLogger] Failed to log audit:', err);
                }
            });

            next();
        };
    }

    /**
     * Log audit event
     */
    async logAudit(req, res) {
        if (!req.user) return; // Skip if no authenticated user

        const action = this.determineAction(req.method, req.path);
        const entityInfo = this.extractEntityInfo(req);

        const logData = {
            logId: `AL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date(),
            userId: req.user._id,
            userName: req.user.name,
            userEmail: req.user.email,
            action,
            entityType: entityInfo.type,
            entityId: entityInfo.id,
            entityName: entityInfo.name,
            changes: this.extractChanges(req, res),
            metadata: {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent'),
                requestId: req.id,
                sessionId: req.sessionID,
                apiEndpoint: req.path,
                httpMethod: req.method,
                statusCode: res.statusCode
            },
            severity: this.determineSeverity(action, res.statusCode),
            category: this.determineCategory(action, entityInfo.type),
            tags: this.generateTags(req, entityInfo)
        };

        // Get previous hash for chain
        const previousLog = await AuditLog.findOne().sort({ timestamp: -1 }).limit(1);
        const previousHash = previousLog ? previousLog.hash : '';

        // Generate hash
        logData.hash = auditHasher.generateHash(logData, previousHash);
        logData.previousHash = previousHash;

        // Save audit log
        const auditLog = new AuditLog(logData);
        await auditLog.save();
    }

    /**
     * Determine action from request
     */
    determineAction(method, path) {
        if (path.includes('/login')) return 'login';
        if (path.includes('/logout')) return 'logout';
        if (path.includes('/export')) return 'export';
        if (path.includes('/import')) return 'import';
        if (path.includes('/approve')) return 'approve';
        if (path.includes('/reject')) return 'reject';

        switch (method) {
            case 'POST': return 'create';
            case 'GET': return 'read';
            case 'PUT':
            case 'PATCH': return 'update';
            case 'DELETE': return 'delete';
            default: return 'read';
        }
    }

    /**
     * Extract entity information from request
     */
    extractEntityInfo(req) {
        const pathParts = req.path.split('/').filter(p => p);

        let type = 'Unknown';
        let id = null;
        let name = null;

        if (pathParts.length >= 2) {
            type = pathParts[1]; // e.g., /api/expenses -> expenses

            if (pathParts.length >= 3 && pathParts[2].match(/^[0-9a-fA-F]{24}$/)) {
                id = pathParts[2];
            }
        }

        // Try to get name from request body or response
        if (req.body && req.body.name) {
            name = req.body.name;
        } else if (req.body && req.body.description) {
            name = req.body.description;
        }

        return { type, id, name };
    }

    /**
     * Extract changes from request/response
     */
    extractChanges(req, res) {
        const changes = {
            before: null,
            after: null,
            fields: []
        };

        if (req.method === 'PUT' || req.method === 'PATCH') {
            changes.before = req.originalData || null;
            changes.after = req.body;
            changes.fields = Object.keys(req.body || {});
        } else if (req.method === 'POST') {
            changes.after = req.body;
            changes.fields = Object.keys(req.body || {});
        } else if (req.method === 'DELETE') {
            changes.before = req.originalData || null;
        }

        return changes;
    }

    /**
     * Determine severity
     */
    determineSeverity(action, statusCode) {
        if (statusCode >= 500) return 'critical';
        if (statusCode >= 400) return 'high';
        if (action === 'delete' || action === 'approve') return 'high';
        if (action === 'update') return 'medium';
        return 'low';
    }

    /**
     * Determine category
     */
    determineCategory(action, entityType) {
        if (action === 'login' || action === 'logout') return 'security';
        if (entityType.includes('user') || entityType.includes('auth')) return 'security';
        if (action === 'delete' || action === 'update') return 'data';
        if (action === 'export' || action === 'import') return 'compliance';
        return 'user_action';
    }

    /**
     * Generate tags
     */
    generateTags(req, entityInfo) {
        const tags = [];

        tags.push(req.method.toLowerCase());
        tags.push(entityInfo.type);

        if (req.path.includes('/api/')) {
            tags.push('api');
        }

        return tags;
    }

    /**
     * Check if audit should be skipped
     */
    shouldSkipAudit(path) {
        const skipPaths = [
            '/health',
            '/ping',
            '/metrics',
            '/favicon.ico',
            '/static/',
            '/public/'
        ];

        return skipPaths.some(skip => path.includes(skip));
    }
}

module.exports = new AuditLogger();
