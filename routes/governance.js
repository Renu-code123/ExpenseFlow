const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ValidationLog = require('../models/ValidationLog');

/**
 * Data Governance Routes
 * Issue #704: API for monitoring data purity and remediation efficacy.
 */

/**
 * @route   GET /api/governance/purity-report
 * @desc    Get aggregate data quality metrics
 */
router.get('/purity-report', auth, async (req, res) => {
    try {
        const stats = await ValidationLog.aggregate([
            { $match: { userId: req.user._id } },
            {
                $group: {
                    _id: null,
                    avgPurityScore: { $avg: '$purityScore' },
                    totalRemediations: { $sum: { $size: '$remediationsApplied' } },
                    failedRecords: { $sum: { $cond: [{ $lt: ['$purityScore', 40] }, 1, 0] } },
                    totalChecks: { $sum: 1 }
                }
            }
        ]);

        res.json({ success: true, data: stats[0] || { avgPurityScore: 100, totalChecks: 0 } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/governance/remediations
 * @desc    Get recent remediation logs
 */
router.get('/remediations', auth, async (req, res) => {
    try {
        const logs = await ValidationLog.find({
            userId: req.user._id,
            'remediationsApplied.0': { $exists: true }
        })
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({ success: true, data: logs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
