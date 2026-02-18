const AuditLog = require('../models/AuditLog');
const auditHasher = require('../utils/auditHasher');

class AuditTrailService {
    /**
     * Query audit logs with advanced filtering
     */
    async queryLogs(filters = {}, options = {}) {
        const {
            userId,
            action,
            entityType,
            entityId,
            startDate,
            endDate,
            severity,
            category,
            tags,
            searchTerm
        } = filters;

        const {
            page = 1,
            limit = 50,
            sortBy = 'timestamp',
            sortOrder = 'desc'
        } = options;

        // Build query
        const query = {};

        if (userId) query.userId = userId;
        if (action) query.action = Array.isArray(action) ? { $in: action } : action;
        if (entityType) query.entityType = Array.isArray(entityType) ? { $in: entityType } : entityType;
        if (entityId) query.entityId = entityId;
        if (severity) query.severity = Array.isArray(severity) ? { $in: severity } : severity;
        if (category) query.category = Array.isArray(category) ? { $in: category } : category;
        if (tags && tags.length > 0) query.tags = { $in: tags };

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        if (searchTerm) {
            query.$or = [
                { userName: { $regex: searchTerm, $options: 'i' } },
                { userEmail: { $regex: searchTerm, $options: 'i' } },
                { entityName: { $regex: searchTerm, $options: 'i' } },
                { 'metadata.ipAddress': { $regex: searchTerm, $options: 'i' } }
            ];
        }

        // Execute query
        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        const [logs, total] = await Promise.all([
            AuditLog.find(query)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .populate('userId', 'name email')
                .lean(),
            AuditLog.countDocuments(query)
        ]);

        return {
            logs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get audit statistics
     */
    async getStatistics(filters = {}) {
        const { startDate, endDate, userId } = filters;

        const query = {};
        if (userId) query.userId = userId;
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        const [
            totalLogs,
            actionStats,
            severityStats,
            categoryStats,
            entityStats,
            recentActivity
        ] = await Promise.all([
            AuditLog.countDocuments(query),
            AuditLog.aggregate([
                { $match: query },
                { $group: { _id: '$action', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            AuditLog.aggregate([
                { $match: query },
                { $group: { _id: '$severity', count: { $sum: 1 } } }
            ]),
            AuditLog.aggregate([
                { $match: query },
                { $group: { _id: '$category', count: { $sum: 1 } } }
            ]),
            AuditLog.aggregate([
                { $match: query },
                { $group: { _id: '$entityType', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            AuditLog.find(query)
                .sort({ timestamp: -1 })
                .limit(10)
                .select('timestamp action entityType severity')
                .lean()
        ]);

        return {
            totalLogs,
            byAction: actionStats,
            bySeverity: severityStats,
            byCategory: categoryStats,
            byEntity: entityStats,
            recentActivity
        };
    }

    /**
     * Verify audit trail integrity
     */
    async verifyIntegrity(filters = {}) {
        const { startDate, endDate, limit = 1000 } = filters;

        const query = {};
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        const logs = await AuditLog.find(query)
            .sort({ timestamp: 1 })
            .limit(limit)
            .lean();

        const verification = await auditHasher.verifyChain(logs);

        return {
            ...verification,
            period: {
                startDate: logs.length > 0 ? logs[0].timestamp : null,
                endDate: logs.length > 0 ? logs[logs.length - 1].timestamp : null
            }
        };
    }

    /**
     * Get user activity timeline
     */
    async getUserTimeline(userId, options = {}) {
        const { days = 30, limit = 100 } = options;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const logs = await AuditLog.find({
            userId,
            timestamp: { $gte: startDate }
        })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        // Group by day
        const timeline = {};
        for (const log of logs) {
            const dateKey = log.timestamp.toISOString().split('T')[0];
            if (!timeline[dateKey]) {
                timeline[dateKey] = {
                    date: dateKey,
                    actions: [],
                    count: 0
                };
            }
            timeline[dateKey].actions.push({
                time: log.timestamp,
                action: log.action,
                entityType: log.entityType,
                severity: log.severity
            });
            timeline[dateKey].count++;
        }

        return Object.values(timeline).sort((a, b) =>
            new Date(b.date) - new Date(a.date)
        );
    }

    /**
     * Get entity history
     */
    async getEntityHistory(entityType, entityId) {
        const logs = await AuditLog.find({
            entityType,
            entityId
        })
            .sort({ timestamp: 1 })
            .populate('userId', 'name email')
            .lean();

        return logs.map(log => ({
            timestamp: log.timestamp,
            action: log.action,
            user: log.userId,
            changes: log.changes,
            severity: log.severity
        }));
    }

    /**
     * Search audit logs
     */
    async searchLogs(searchTerm, options = {}) {
        const { limit = 50 } = options;

        const logs = await AuditLog.find({
            $or: [
                { userName: { $regex: searchTerm, $options: 'i' } },
                { userEmail: { $regex: searchTerm, $options: 'i' } },
                { entityName: { $regex: searchTerm, $options: 'i' } },
                { entityType: { $regex: searchTerm, $options: 'i' } },
                { 'metadata.ipAddress': { $regex: searchTerm, $options: 'i' } }
            ]
        })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        return logs;
    }

    /**
     * Get critical events
     */
    async getCriticalEvents(options = {}) {
        const { days = 7, limit = 50 } = options;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const logs = await AuditLog.find({
            severity: { $in: ['critical', 'high'] },
            timestamp: { $gte: startDate }
        })
            .sort({ timestamp: -1 })
            .limit(limit)
            .populate('userId', 'name email')
            .lean();

        return logs;
    }

    /**
     * Archive old logs
     */
    async archiveLogs(daysOld = 365) {
        const archiveDate = new Date();
        archiveDate.setDate(archiveDate.getDate() - daysOld);

        const result = await AuditLog.updateMany(
            {
                timestamp: { $lt: archiveDate },
                isArchived: false
            },
            {
                $set: {
                    isArchived: true,
                    retentionDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year retention
                }
            }
        );

        return {
            archived: result.modifiedCount,
            archiveDate
        };
    }

    /**
     * Get audit dashboard data
     */
    async getDashboard() {
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const [
            total24h,
            critical24h,
            total7d,
            topUsers,
            topEntities,
            recentCritical
        ] = await Promise.all([
            AuditLog.countDocuments({ timestamp: { $gte: last24Hours } }),
            AuditLog.countDocuments({
                timestamp: { $gte: last24Hours },
                severity: { $in: ['critical', 'high'] }
            }),
            AuditLog.countDocuments({ timestamp: { $gte: last7Days } }),
            AuditLog.aggregate([
                { $match: { timestamp: { $gte: last7Days } } },
                { $group: { _id: '$userId', count: { $sum: 1 }, userName: { $first: '$userName' } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]),
            AuditLog.aggregate([
                { $match: { timestamp: { $gte: last7Days } } },
                { $group: { _id: '$entityType', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]),
            AuditLog.find({
                severity: { $in: ['critical', 'high'] }
            })
                .sort({ timestamp: -1 })
                .limit(10)
                .lean()
        ]);

        return {
            summary: {
                total24h,
                critical24h,
                total7d
            },
            topUsers,
            topEntities,
            recentCritical
        };
    }
}

module.exports = new AuditTrailService();
