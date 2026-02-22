const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const TenantConfig = require('../models/TenantConfig');
const Workspace = require('../models/Workspace');
const StressScenario = require('../models/StressScenario');
const stressTestEngine = require('../services/stressTestEngine');
const ResponseFactory = require('../utils/ResponseFactory');

/**
 * Global Admin & Tenant Monitoring API
 * Issue #729: Endpoints for system-wide tenant auditing and health checks.
 */

// Middleware to ensure user is global admin
const requireGlobalAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, error: 'Administrative access required' });
    }
};

/**
 * @route   GET /api/admin/tenants
 * @desc    Get all tenants and their isolation status
 */
router.get('/tenants', auth, requireGlobalAdmin, async (req, res) => {
    try {
        const tenants = await TenantConfig.find()
            .populate('workspaceId', 'name status owner')
            .lean();

        return ResponseFactory.success(res, tenants);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   PATCH /api/admin/tenants/:workspaceId
 * @desc    Update isolation level or policy for a tenant
 */
router.patch('/tenants/:workspaceId', auth, requireGlobalAdmin, async (req, res) => {
    try {
        const config = await TenantConfig.findOneAndUpdate(
            { workspaceId: req.params.workspaceId },
            req.body,
            { new: true, upsert: true }
        );
        return ResponseFactory.success(res, config);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/admin/system-health
 * @desc    Global system stats across all tenants
 */
router.get('/system-health', auth, requireGlobalAdmin, async (req, res) => {
    try {
        const workspaceCount = await Workspace.countDocuments();
        const tenantConfigs = await TenantConfig.countDocuments();

        const health = {
            totalWorkspaces: workspaceCount,
            configuredTenants: tenantConfigs,
            activeIsolationLayers: await TenantConfig.countDocuments({ isolationLevel: 'strict' }),
            status: 'healthy',
            timestamp: new Date()
        };

        return ResponseFactory.success(res, health);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/admin/scenarios
 * @desc    Get all active stress scenarios
 */
router.get('/scenarios', auth, requireGlobalAdmin, async (req, res) => {
    const scenarios = await StressScenario.find();
    res.json({ success: true, scenarios });
});

/**
 * @route   POST /api/admin/scenarios
 * @desc    Create a new stress scenario
 */
router.post('/scenarios', auth, requireGlobalAdmin, async (req, res) => {
    try {
        const scenario = await StressScenario.create(req.body);
        res.status(201).json({ success: true, data: scenario });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/admin/workspaces/:id/liquidity-audit
 * @desc    Run real-time stress test on a specific workspace
 */
router.get('/workspaces/:id/liquidity-audit', auth, requireGlobalAdmin, async (req, res) => {
    try {
        const audit = await stressTestEngine.evaluateLiquidity(req.params.id);
        res.json({ success: true, audit });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
