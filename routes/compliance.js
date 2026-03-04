const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const complianceEngine = require('../services/complianceEngine');
const forensicAuditService = require('../services/forensicAuditService');
const TaxAuditPack = require('../models/TaxAuditPack');
const ComplianceRule = require('../models/ComplianceRule');

/**
 * Get Compliance Dashboard Stats
 */
router.get('/dashboard', auth, async (req, res) => {
    try {
        const auditPacks = await TaxAuditPack.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(5);
        const activeRules = await ComplianceRule.countDocuments({ isActive: true });

        res.json({
            success: true,
            data: {
                auditPacks,
                activeRulesCount: activeRules,
                complianceScore: 94 // Mock score
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Generate New Audit Pack
 */
router.post('/generate-audit', auth, async (req, res) => {
    try {
        const { start, end } = req.body;
        const pack = await forensicAuditService.generateAuditPack(req.user._id, {
            start: new Date(start),
            end: new Date(end)
        });
        res.json({ success: true, data: pack });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Evaluate Transaction Tax (Preview)
 */
router.post('/evaluate', auth, async (req, res) => {
    try {
        const evaluation = await complianceEngine.evaluateTransactionTax(req.body);
        res.json({ success: true, data: evaluation });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Manage Compliance Rules (Admin)
 */
router.post('/rules', auth, async (req, res) => {
    try {
        const rule = new ComplianceRule(req.body);
        await rule.save();
        res.json({ success: true, data: rule });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.get('/rules', auth, async (req, res) => {
    try {
        const rules = await ComplianceRule.find({}).sort({ jurisdiction: 1 });
        res.json({ success: true, data: rules });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// GLOBAL NEXUS SURFACE ROUTES (Issue #961)
// ============================================

/**
 * GET /api/compliance/nexus
 * Returns all active tax nexus configurations (Global Nexus Surface visualization).
 */
router.get('/nexus', auth, async (req, res) => {
    try {
        const TaxNexus = require('../models/TaxNexus');
        const nexusList = await TaxNexus.find({ isActive: true })
            .populate('policyNodeId', 'name action priority')
            .sort({ jurisdictionCode: 1 });
        res.json({ success: true, count: nexusList.length, data: nexusList });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/compliance/nexus/detect
 * Detect which tax jurisdictions apply to a given transaction context.
 */
router.post('/nexus/detect', auth, async (req, res) => {
    try {
        const nexusSwitchgear = require('../services/nexusSwitchgear');
        const resolution = await nexusSwitchgear.resolve(req.body);
        res.json({ success: true, data: resolution });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/compliance/nexus/sync
 * Manually trigger a global tax-rate sync (admin).
 */
router.post('/nexus/sync', auth, async (req, res) => {
    try {
        const nexusUpdateJob = require('../jobs/nexusUpdateJob');
        await nexusUpdateJob.syncGlobalRates();
        res.json({ success: true, message: 'Tax nexus rates synced successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
