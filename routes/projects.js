const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const projectService = require('../services/projectService');
const costingEngine = require('../services/costingEngine');

// Create Project
router.post('/', auth, async (req, res) => {
    try {
        const project = await projectService.createProject(req.user._id, req.body);
        res.status(201).json(project);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Get All Projects
router.get('/', auth, async (req, res) => {
    try {
        const projects = await projectService.getProjects(req.user._id, req.query);
        res.json(projects);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Project Details & Analysis
router.get('/:id', auth, async (req, res) => {
    try {
        const project = await projectService.getProjectById(req.user._id, req.params.id);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const analysis = await costingEngine.calculateProjectCosts(req.user._id, req.params.id);
        res.json({ project, analysis });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update Project
router.put('/:id', auth, async (req, res) => {
    try {
        const project = await projectService.updateProject(req.user._id, req.params.id, req.body);
        res.json(project);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Run Costing Refresh
router.post('/:id/recalculate', auth, async (req, res) => {
    try {
        const analysis = await costingEngine.calculateProjectCosts(req.user._id, req.params.id, req.body.period);
        res.json(analysis);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Enterprise ROI Matrix
router.get('/analytics/roi-matrix', auth, async (req, res) => {
    try {
        const matrix = await costingEngine.getROIMatrix(req.user._id);
        res.json(matrix);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Project Stats
router.get('/analytics/stats', auth, async (req, res) => {
    try {
        const stats = await projectService.getProjectStats(req.user._id);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
