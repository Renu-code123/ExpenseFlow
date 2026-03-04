const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const assetService = require('../services/assetService');

// Register Asset
router.post('/', auth, async (req, res) => {
    try {
        const asset = await assetService.registerAsset(req.user._id, req.body);
        res.status(201).json(asset);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// List Assets
router.get('/', auth, async (req, res) => {
    try {
        const assets = await assetService.getAssets(req.user._id, req.query);
        res.json(assets);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Summary
router.get('/summary', auth, async (req, res) => {
    try {
        const summary = await assetService.getSummary(req.user._id);
        res.json(summary);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Asset Details
router.get('/:id', auth, async (req, res) => {
    try {
        const details = await assetService.getAssetDetails(req.user._id, req.params.id);
        res.json(details);
    } catch (err) {
        res.status(404).json({ message: err.message });
    }
});

// Run Manual Depreciation
router.post('/run-depreciation', auth, async (req, res) => {
    try {
        const { year, month } = req.body;
        const result = await assetService.runDepreciationForUser(req.user._id, year, month);
        res.json({ message: 'Depreciation cycle completed', results: result });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Dispose Asset
router.post('/:id/dispose', auth, async (req, res) => {
    try {
        const asset = await assetService.disposeAsset(req.user._id, req.params.id, req.body);
        res.json(asset);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

module.exports = router;
