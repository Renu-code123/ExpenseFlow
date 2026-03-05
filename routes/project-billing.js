const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Project = require('../models/Project');
const projectRevenueService = require('../services/projectRevenueService');
const invoiceSyncService = require('../services/invoiceSyncService');
const ProjectInvoice = require('../models/ProjectInvoice');

/**
 * Get Project List with Financials
 */
router.get('/projects', auth, async (req, res) => {
    try {
        const stats = await projectRevenueService.getAllProjectFinancials(req.user._id);
        const projects = await Project.find({ userId: req.user._id });
        res.json({ success: true, data: { projects, stats } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Create New Project
 */
router.post('/projects', auth, async (req, res) => {
    try {
        const project = new Project({ ...req.body, userId: req.user._id });
        await project.save();
        res.json({ success: true, data: project });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Generate Invoice for Project
 */
router.post('/generate-invoice/:projectId', auth, async (req, res) => {
    try {
        const invoice = await invoiceSyncService.generateConsolidatedInvoice(req.params.projectId, req.user._id);
        res.json({ success: true, data: invoice });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Get Invoices
 */
router.get('/invoices', auth, async (req, res) => {
    try {
        const invoices = await ProjectInvoice.find({ userId: req.user._id }).populate('projectId');
        res.json({ success: true, data: invoices });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
