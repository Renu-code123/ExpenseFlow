const Transaction = require('../models/Transaction');
const dataAggregator = require('../utils/dataAggregator');
const templates = require('../templates/financialTemplates');
const fs = require('fs').promises;
const path = require('path');

/**
 * Heterogeneous Reporting Engine
 * Issue #659: Core service for non-blocked generation of complex financial reports
 */
class ReportingEngine {
    /**
     * Generate an on-demand report
     */
    async generateReport(userId, options) {
        const { startDate, endDate, templateKey, format, workspaceId } = options;

        // 1. Data Retrieval
        const query = { user: userId };
        if (startDate || endDate) query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
        if (workspaceId) query.workspace = workspaceId;

        const transactions = await Transaction.find(query).lean();

        // 2. Data Aggregation
        const stats = dataAggregator.aggregateDetails(transactions);

        // 3. Transformation / Format Generation
        let reportData;
        switch (format) {
            case 'json':
                reportData = JSON.stringify({ metadata: options, stats, items: transactions }, null, 2);
                break;
            case 'csv':
                reportData = this._generateCsv(transactions);
                break;
            case 'pdf':
            case 'html':
                reportData = templates.generateHtml(templateKey || 'monthlySummary', options, stats);
                break;
            default:
                throw new Error('Unsupported format');
        }

        return {
            fileName: `report_${Date.now()}.${format}`,
            data: reportData,
            mimeType: this._getMimeType(format),
            summary: {
                totalTx: transactions.length,
                totalVolume: stats.totalVolume
            }
        };
    }

    /**
     * Internal CSV Generator (Professional Multi-column)
     */
    _generateCsv(items) {
        if (items.length === 0) return '';
        const headers = Object.keys(items[0]).join(',');
        const rows = items.map(item => {
            return Object.values(item).map(val => {
                const str = String(val).replace(/,/g, ''); // Simple Escaping
                return `"${str}"`;
            }).join(',');
        }).join('\n');
        return `${headers}\n${rows}`;
    }

    _getMimeType(format) {
        const map = {
            pdf: 'application/pdf',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            csv: 'text/csv',
            json: 'application/json',
            html: 'text/html'
        };
        return map[format] || 'application/octet-stream';
    }
}

module.exports = new ReportingEngine();
