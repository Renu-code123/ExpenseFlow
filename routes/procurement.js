const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const procurementService = require('../services/procurementService');
const assetService = require('../services/assetService');

// Procurement Orders
router.get('/orders', auth, async (req, res) => {
    try {
        const orders = await procurementService.getOrders(req.user._id, req.query);
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/requisition', auth, async (req, res) => {
    try {
        const pr = await procurementService.createRequisition(req.user._id, req.body);
        res.json({ success: true, data: pr });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.post('/submit/:id', auth, async (req, res) => {
    try {
        const pr = await procurementService.submitForApproval(req.params.id, req.user._id);
        res.json({ success: true, data: pr });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.post('/receive/:id', auth, async (req, res) => {
    try {
        const result = await procurementService.receiveGoods(req.params.id, req.user._id);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// Assets Dashboard
router.get('/assets/dashboard', auth, async (req, res) => {
    try {
        const dashboard = await assetService.getAssetDashboard(req.user._id);
        res.json({ success: true, data: dashboard });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/assets/:id/depreciation', auth, async (req, res) => {
    try {
        const history = await assetService.getDepreciationHistory(req.params.id);
        res.json({ success: true, data: history });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin/System Trigger
router.post('/admin/run-depreciation', auth, async (req, res) => {
    // Should be restricted to admin in production
    try {
        const result = await assetService.runBatchDepreciation();
        res.json({ success: true, processed: result.length, details: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Vendor Management
router.get('/vendors', auth, async (req, res) => {
    try {
        const Vendor = require('../models/Vendor');
        const vendors = await Vendor.find({ userId: req.user._id });
        res.json({ success: true, data: vendors });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/vendors', auth, async (req, res) => {
    try {
        const Vendor = require('../models/Vendor');
        const vendor = new Vendor({ ...req.body, userId: req.user._id });
        await vendor.save();
        res.json({ success: true, data: vendor });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// Asset Maintenance
router.post('/assets/:id/maintenance', auth, async (req, res) => {
    try {
        const asset = await assetService.recordMaintenance(req.params.id, req.body);
        res.json({ success: true, data: asset });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;
