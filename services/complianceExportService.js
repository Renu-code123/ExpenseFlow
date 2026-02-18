const ComplianceReport = require('../models/ComplianceReport');
const AuditLog = require('../models/AuditLog');
const auditHasher = require('../utils/auditHasher');
const fs = require('fs').promises;
const path = require('path');

class ComplianceExportService {
    constructor() {
        this.exportDir = path.join(__dirname, '../exports');
    }

    /**
     * Generate compliance report
     */
    async generateReport(userId, options = {}) {
        const {
            reportType = 'CUSTOM',
            startDate,
            endDate,
            filters = {},
            exportFormats = ['JSON']
        } = options;

        const reportId = `CR-${Date.now()}`;

        // Create report record
        const report = new ComplianceReport({
            reportId,
            reportType,
            generatedBy: userId,
            period: {
                startDate: new Date(startDate),
                endDate: new Date(endDate)
            },
            filters,
            status: 'generating'
        });

        await report.save();

        try {
            // Query audit logs
            const logs = await this.queryLogsForReport(startDate, endDate, filters);

            // Calculate summary
            report.summary = this.calculateSummary(logs);

            // Generate exports in requested formats
            const exports = [];
            for (const format of exportFormats) {
                const exportData = await this.exportToFormat(logs, format, reportId, reportType);
                exports.push(exportData);
            }

            report.exportFormats = exports;
            report.integrityHash = auditHasher.generateReportHash({
                reportId,
                logs: logs.length,
                summary: report.summary
            });
            report.status = 'completed';
            report.metadata = {
                recordCount: logs.length,
                totalPages: Math.ceil(logs.length / 100)
            };

            await report.save();

            return report;
        } catch (err) {
            report.status = 'failed';
            await report.save();
            throw err;
        }
    }

    /**
     * Query logs for report
     */
    async queryLogsForReport(startDate, endDate, filters) {
        const query = {
            timestamp: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        };

        if (filters.users && filters.users.length > 0) {
            query.userId = { $in: filters.users };
        }
        if (filters.actions && filters.actions.length > 0) {
            query.action = { $in: filters.actions };
        }
        if (filters.entityTypes && filters.entityTypes.length > 0) {
            query.entityType = { $in: filters.entityTypes };
        }
        if (filters.severity && filters.severity.length > 0) {
            query.severity = { $in: filters.severity };
        }
        if (filters.categories && filters.categories.length > 0) {
            query.category = { $in: filters.categories };
        }

        return await AuditLog.find(query)
            .sort({ timestamp: 1 })
            .populate('userId', 'name email')
            .lean();
    }

    /**
     * Calculate summary statistics
     */
    calculateSummary(logs) {
        const summary = {
            totalLogs: logs.length,
            criticalEvents: 0,
            securityEvents: 0,
            dataModifications: 0,
            uniqueUsers: new Set(),
            failedAttempts: 0
        };

        for (const log of logs) {
            if (log.severity === 'critical' || log.severity === 'high') {
                summary.criticalEvents++;
            }
            if (log.category === 'security') {
                summary.securityEvents++;
            }
            if (log.action === 'update' || log.action === 'delete') {
                summary.dataModifications++;
            }
            if (log.userId) {
                summary.uniqueUsers.add(log.userId.toString());
            }
            if (log.metadata && log.metadata.statusCode >= 400) {
                summary.failedAttempts++;
            }
        }

        summary.uniqueUsers = summary.uniqueUsers.size;

        return summary;
    }

    /**
     * Export to specific format
     */
    async exportToFormat(logs, format, reportId, reportType) {
        const fileName = `${reportId}_${reportType}_${Date.now()}.${format.toLowerCase()}`;
        const filePath = path.join(this.exportDir, fileName);

        // Ensure export directory exists
        await fs.mkdir(this.exportDir, { recursive: true });

        let fileSize = 0;

        switch (format) {
            case 'JSON':
                fileSize = await this.exportToJSON(logs, filePath);
                break;
            case 'CSV':
                fileSize = await this.exportToCSV(logs, filePath);
                break;
            case 'EXCEL':
                fileSize = await this.exportToExcel(logs, filePath);
                break;
            case 'PDF':
                fileSize = await this.exportToPDF(logs, filePath, reportType);
                break;
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }

        return {
            format,
            filePath,
            fileSize,
            generatedAt: new Date()
        };
    }

    /**
     * Export to JSON
     */
    async exportToJSON(logs, filePath) {
        const data = JSON.stringify(logs, null, 2);
        await fs.writeFile(filePath, data, 'utf8');
        const stats = await fs.stat(filePath);
        return stats.size;
    }

    /**
     * Export to CSV
     */
    async exportToCSV(logs, filePath) {
        const headers = [
            'Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID',
            'Severity', 'Category', 'IP Address', 'Status Code'
        ];

        const rows = logs.map(log => [
            log.timestamp.toISOString(),
            log.userName || '',
            log.action,
            log.entityType,
            log.entityId || '',
            log.severity,
            log.category,
            log.metadata?.ipAddress || '',
            log.metadata?.statusCode || ''
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        await fs.writeFile(filePath, csv, 'utf8');
        const stats = await fs.stat(filePath);
        return stats.size;
    }

    /**
     * Export to Excel (simplified - would use a library like exceljs in production)
     */
    async exportToExcel(logs, filePath) {
        // Simplified: Export as CSV with .xlsx extension
        // In production, use exceljs or similar library
        return await this.exportToCSV(logs, filePath);
    }

    /**
     * Export to PDF (simplified - would use a library like pdfkit in production)
     */
    async exportToPDF(logs, filePath, reportType) {
        // Simplified: Create a text-based PDF representation
        const content = [
            `Compliance Report: ${reportType}`,
            `Generated: ${new Date().toISOString()}`,
            `Total Records: ${logs.length}`,
            '',
            'Audit Trail:',
            ...logs.map(log =>
                `[${log.timestamp.toISOString()}] ${log.userName} - ${log.action} - ${log.entityType}`
            )
        ].join('\n');

        await fs.writeFile(filePath, content, 'utf8');
        const stats = await fs.stat(filePath);
        return stats.size;
    }

    /**
     * Get compliance templates
     */
    getComplianceTemplates() {
        return {
            SOX: {
                name: 'Sarbanes-Oxley Act',
                description: 'Financial reporting and internal controls',
                requiredFields: ['timestamp', 'userId', 'action', 'entityType', 'changes'],
                filters: {
                    categories: ['data', 'compliance'],
                    entityTypes: ['Transaction', 'Expense', 'Budget']
                }
            },
            GDPR: {
                name: 'General Data Protection Regulation',
                description: 'Personal data processing and privacy',
                requiredFields: ['timestamp', 'userId', 'action', 'entityType', 'metadata.ipAddress'],
                filters: {
                    categories: ['security', 'data'],
                    entityTypes: ['User', 'Profile']
                }
            },
            HIPAA: {
                name: 'Health Insurance Portability and Accountability Act',
                description: 'Protected health information access',
                requiredFields: ['timestamp', 'userId', 'action', 'entityType', 'severity'],
                filters: {
                    severity: ['high', 'critical'],
                    categories: ['security', 'compliance']
                }
            },
            PCI_DSS: {
                name: 'Payment Card Industry Data Security Standard',
                description: 'Payment card data security',
                requiredFields: ['timestamp', 'userId', 'action', 'metadata.ipAddress'],
                filters: {
                    entityTypes: ['Payment', 'Transaction'],
                    categories: ['security', 'data']
                }
            },
            ISO_27001: {
                name: 'ISO/IEC 27001',
                description: 'Information security management',
                requiredFields: ['timestamp', 'userId', 'action', 'severity', 'category'],
                filters: {
                    categories: ['security'],
                    severity: ['high', 'critical']
                }
            }
        };
    }

    /**
     * Get report by ID
     */
    async getReport(reportId) {
        return await ComplianceReport.findOne({ reportId })
            .populate('generatedBy', 'name email')
            .lean();
    }

    /**
     * List reports
     */
    async listReports(userId, options = {}) {
        const { limit = 20, page = 1 } = options;

        const query = { generatedBy: userId };
        const skip = (page - 1) * limit;

        const [reports, total] = await Promise.all([
            ComplianceReport.find(query)
                .sort({ generatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ComplianceReport.countDocuments(query)
        ]);

        return {
            reports,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Download report file
     */
    async downloadReport(reportId, format) {
        const report = await this.getReport(reportId);

        if (!report) {
            throw new Error('Report not found');
        }

        const exportData = report.exportFormats.find(e => e.format === format);

        if (!exportData) {
            throw new Error(`Format ${format} not available for this report`);
        }

        return {
            filePath: exportData.filePath,
            fileName: path.basename(exportData.filePath)
        };
    }
}

module.exports = new ComplianceExportService();
