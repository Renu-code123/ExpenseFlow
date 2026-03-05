const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const reportingEngine = require('../services/reportingEngine');
const ScheduledReport = require('../models/ScheduledReport');

/**
 * Advanced Export & Reporting API
 * Issue #659: Heterogeneous Data Export Engine
 */

/**
 * @route   POST /api/exports/generate
 * @desc    Generate a report on-demand (Heterogeneous formats)
 */
router.post('/generate', auth, async (req, res) => {
    try {
        const result = await reportingEngine.generateReport(req.user._id, req.body);

        // For large reports, we set specific headers
        res.setHeader('Content-Type', result.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);

        res.send(result.data);
    } catch (error) {
        console.error('[ReportingEngine] Export failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/exports/schedule
 * @desc    Schedule a recurring financial report
 */
router.post('/schedule', auth, async (req, res) => {
    try {
        const report = new ScheduledReport({
            ...req.body,
            userId: req.user._id,
            nextRun: new Date() // Start immediately or as specified
        });

        if (req.body.startDate) {
            report.nextRun = new Date(req.body.startDate);
        }

        await report.save();
        res.status(201).json({ success: true, data: report });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/exports/schedules
 * @desc    List all scheduled reports for user
 */
router.get('/schedules', auth, async (req, res) => {
    try {
        const schedules = await ScheduledReport.find({ userId: req.user._id });
        res.json({ success: true, data: schedules });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   DELETE /api/exports/schedules/:id
 * @desc    Cancel a scheduled report
 */
router.delete('/schedules/:id', auth, async (req, res) => {
    try {
        await ScheduledReport.deleteOne({ _id: req.params.id, userId: req.user._id });
        res.json({ success: true, message: 'Schedule cancelled' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
