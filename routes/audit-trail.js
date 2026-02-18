const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const auditTrailService = require('../services/auditTrailService');
const complianceExportService = require('../services/complianceExportService');

/**
 * Get Audit Dashboard
 */
router.get('/dashboard', auth, async (req, res) => {
    try {
        const dashboard = await auditTrailService.getDashboard();
        res.json({ success: true, data: dashboard });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Query Audit Logs
 */
router.post('/query', auth, async (req, res) => {
    try {
        const { filters, options } = req.body;
        const result = await auditTrailService.queryLogs(filters, options);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Audit Statistics
 */
router.get('/statistics', auth, async (req, res) => {
    try {
        const { startDate, endDate, userId } = req.query;
        const stats = await auditTrailService.getStatistics({ startDate, endDate, userId });
        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Verify Integrity
 */
router.post('/verify', auth, async (req, res) => {
    try {
        const { startDate, endDate, limit } = req.body;
        const verification = await auditTrailService.verifyIntegrity({ startDate, endDate, limit });
        res.json({ success: true, data: verification });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get User Timeline
 */
router.get('/timeline/:userId', auth, async (req, res) => {
    try {
        const { days, limit } = req.query;
        const timeline = await auditTrailService.getUserTimeline(req.params.userId, { days, limit });
        res.json({ success: true, data: timeline });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Entity History
 */
router.get('/entity/:entityType/:entityId', auth, async (req, res) => {
    try {
        const { entityType, entityId } = req.params;
        const history = await auditTrailService.getEntityHistory(entityType, entityId);
        res.json({ success: true, data: history });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Search Logs
 */
router.get('/search', auth, async (req, res) => {
    try {
        const { q, limit } = req.query;
        const results = await auditTrailService.searchLogs(q, { limit });
        res.json({ success: true, data: results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Critical Events
 */
router.get('/critical', auth, async (req, res) => {
    try {
        const { days, limit } = req.query;
        const events = await auditTrailService.getCriticalEvents({ days, limit });
        res.json({ success: true, data: events });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Generate Compliance Report
 */
router.post('/compliance/generate', auth, async (req, res) => {
    try {
        const { reportType, startDate, endDate, filters, exportFormats } = req.body;

        const report = await complianceExportService.generateReport(req.user._id, {
            reportType,
            startDate,
            endDate,
            filters,
            exportFormats
        });

        res.json({ success: true, data: report });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Compliance Templates
 */
router.get('/compliance/templates', auth, async (req, res) => {
    try {
        const templates = complianceExportService.getComplianceTemplates();
        res.json({ success: true, data: templates });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * List Compliance Reports
 */
router.get('/compliance/reports', auth, async (req, res) => {
    try {
        const { page, limit } = req.query;
        const result = await complianceExportService.listReports(req.user._id, { page, limit });
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Specific Report
 */
router.get('/compliance/reports/:reportId', auth, async (req, res) => {
    try {
        const report = await complianceExportService.getReport(req.params.reportId);

        if (!report) {
            return res.status(404).json({ success: false, error: 'Report not found' });
        }

        res.json({ success: true, data: report });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Download Report
 */
router.get('/compliance/download/:reportId/:format', auth, async (req, res) => {
    try {
        const { reportId, format } = req.params;
        const { filePath, fileName } = await complianceExportService.downloadReport(reportId, format);

        res.download(filePath, fileName);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Archive Old Logs
 */
router.post('/archive', auth, async (req, res) => {
    try {
        const { daysOld } = req.body;
        const result = await auditTrailService.archiveLogs(daysOld);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
