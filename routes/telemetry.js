const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const telemetryAggregator = require('../services/telemetryAggregator');
const ResponseFactory = require('../utils/responseFactory');

/**
 * Telemetry Routes
 * Issue #755: Admin dashboard for global health monitoring and forensic analysis.
 */

/**
 * @route   GET /api/telemetry/health
 * @desc    Get system-wide health and latency metrics
 */
router.get('/health', auth, async (req, res) => {
    // Check if user has admin permissions
    if (req.user.role !== 'admin') {
        return ResponseFactory.error(res, 403, 'Unauthorized access to telemetry data');
    }

    try {
        const stats = await telemetryAggregator.getTenantStats(req.headers['x-tenant-id'] || req.user.tenantId);
        return ResponseFactory.success(res, stats);
    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   GET /api/telemetry/security-alerts
 * @desc    Fetch critical security alerts recorded in the forensic log
 */
router.get('/security-alerts', auth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return ResponseFactory.error(res, 403, 'Unauthorized');
    }

    try {
        const alerts = await telemetryAggregator.getSecurityAlerts(50);
        return ResponseFactory.success(res, alerts);
    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

module.exports = router;
