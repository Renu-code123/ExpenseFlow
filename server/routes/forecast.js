/**
 * Forecast Routes
 * Issue #522: Intelligent Cash Flow Forecasting & Runway Analytics
 */

const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const cashFlowForecastService = require('../services/cashFlowForecastService');

// Apply authentication to all routes
router.use(protect);

/**
 * @route   POST /api/forecast/generate
 * @desc    Generate a new forecast
 * @access  Private
 */
router.post('/generate', async (req, res) => {
    try {
        const { projectionDays, includeScenarios } = req.body;

        const forecast = await cashFlowForecastService.generateForecast(req.user._id, {
            projectionDays: projectionDays || 180,
            includeScenarios: includeScenarios !== false // default true
        });

        res.json({
            success: true,
            data: forecast
        });
    } catch (error) {
        console.error('[Forecast Routes] Error generating forecast:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate forecast'
        });
    }
});

/**
 * @route   GET /api/forecast/latest
 * @desc    Get latest forecast
 * @access  Private
 */
router.get('/latest', async (req, res) => {
    try {
        const forecast = await cashFlowForecastService.getLatestForecast(req.user._id);

        if (!forecast) {
            return res.status(404).json({
                success: false,
                message: 'No forecast found. Generate one first.'
            });
        }

        res.json({
            success: true,
            data: forecast
        });
    } catch (error) {
        console.error('[Forecast Routes] Error fetching latest forecast:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch forecast'
        });
    }
});

/**
 * @route   GET /api/forecast/history
 * @desc    Get forecast history
 * @access  Private
 */
router.get('/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const history = await cashFlowForecastService.getForecastHistory(req.user._id, limit);

        res.json({
            success: true,
            data: history,
            count: history.length
        });
    } catch (error) {
        console.error('[Forecast Routes] Error fetching forecast history:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch forecast history'
        });
    }
});

/**
 * @route   POST /api/forecast/simulate
 * @desc    Simulate a custom scenario
 * @access  Private
 */
router.post('/simulate', async (req, res) => {
    try {
        const { adjustments, baseSnapshotId } = req.body;

        if (!adjustments || !Array.isArray(adjustments)) {
            return res.status(400).json({
                success: false,
                message: 'Adjustments array is required'
            });
        }

        const simulation = await cashFlowForecastService.simulateScenario(req.user._id, {
            adjustments,
            baseSnapshotId
        });

        res.json({
            success: true,
            data: simulation
        });
    } catch (error) {
        console.error('[Forecast Routes] Error simulating scenario:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to simulate scenario'
        });
    }
});

/**
 * @route   GET /api/forecast/alerts
 * @desc    Get forecast alerts
 * @access  Private
 */
router.get('/alerts', async (req, res) => {
    try {
        const alertStatus = await cashFlowForecastService.getAlertStatus(req.user._id);

        res.json({
            success: true,
            data: alertStatus
        });
    } catch (error) {
        console.error('[Forecast Routes] Error fetching alerts:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch alerts'
        });
    }
});

/**
 * @route   GET /api/forecast/burn-rate
 * @desc    Get current burn rate analysis
 * @access  Private
 */
router.get('/burn-rate', async (req, res) => {
    try {
        const burnRateData = await cashFlowForecastService.calculateBurnRate(req.user._id);

        res.json({
            success: true,
            data: burnRateData
        });
    } catch (error) {
        console.error('[Forecast Routes] Error calculating burn rate:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to calculate burn rate'
        });
    }
});

module.exports = router;
