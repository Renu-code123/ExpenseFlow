const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const locationService = require('../services/locationService');
const geocodingJob = require('../jobs/geocodingJob');

/**
 * @route   GET /api/maps/nearby
 * @desc    Get transactions within a radius
 * @access  Private
 */
router.get('/nearby', auth, async (req, res) => {
    try {
        const { lng, lat, radius } = req.query;
        if (!lng || !lat) {
            return res.status(400).json({ error: 'Longitude and Latitude are required' });
        }

        const transactions = await locationService.findNear(
            req.user._id,
            lng,
            lat,
            radius ? parseInt(radius) : 5000
        );

        res.json({ success: true, count: transactions.length, data: transactions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/maps/hotspots
 * @desc    Identify spending clusters (hotspots)
 * @access  Private
 */
router.get('/hotspots', auth, async (req, res) => {
    try {
        const { radiusKm } = req.query;
        const clusters = await locationService.getSpendingClusters(
            req.user._id,
            radiusKm ? parseFloat(radiusKm) : 1
        );
        res.json({ success: true, count: clusters.length, data: clusters });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/maps/backfill
 * @desc    Trigger background geocoding (Admin/Dev tool)
 * @access  Private
 */
router.post('/backfill', auth, async (req, res) => {
    try {
        // In a real app, check for admin privileges here
        const results = await geocodingJob.backfillGeocoding(req.body.limit);
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
