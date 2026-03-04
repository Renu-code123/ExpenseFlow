const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const varianceAnalysisService = require('../services/varianceAnalysisService');
const spendForecaster = require('../services/spendForecaster');
const budgetOptimizer = require('../services/budgetOptimizer');
const BudgetVariance = require('../models/BudgetVariance');
const SpendForecast = require('../models/SpendForecast');

/**
 * Get Variance Dashboard
 */
router.get('/variance/dashboard', auth, async (req, res) => {
    try {
        const dashboard = await varianceAnalysisService.getVarianceDashboard(req.user._id);
        res.json({ success: true, data: dashboard });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Run Variance Analysis
 */
router.post('/variance/analyze', auth, async (req, res) => {
    try {
        const { budgetId, startDate, endDate } = req.body;

        if (!budgetId || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'budgetId, startDate, and endDate are required'
            });
        }

        const variance = await varianceAnalysisService.analyzeVariance(
            req.user._id,
            budgetId,
            { startDate: new Date(startDate), endDate: new Date(endDate) }
        );

        res.json({ success: true, data: variance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Variance Trend
 */
router.get('/variance/trend/:budgetId', auth, async (req, res) => {
    try {
        const { months } = req.query;

        const trend = await varianceAnalysisService.getVarianceTrend(
            req.user._id,
            req.params.budgetId,
            parseInt(months) || 6
        );

        res.json({ success: true, data: trend });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get All Variances
 */
router.get('/variances', auth, async (req, res) => {
    try {
        const { budgetId, status, limit } = req.query;

        const query = { userId: req.user._id };
        if (budgetId) query.budgetId = budgetId;
        if (status) query.status = status;

        const variances = await BudgetVariance.find(query)
            .sort({ analysisDate: -1 })
            .limit(parseInt(limit) || 50);

        res.json({ success: true, data: variances });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Specific Variance
 */
router.get('/variances/:id', auth, async (req, res) => {
    try {
        const variance = await BudgetVariance.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!variance) {
            return res.status(404).json({ success: false, error: 'Variance not found' });
        }

        res.json({ success: true, data: variance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Generate Spend Forecast
 */
router.post('/forecast/generate', auth, async (req, res) => {
    try {
        const { budgetId, category, forecastDays, method, historicalDays } = req.body;

        const forecast = await spendForecaster.generateForecast(req.user._id, {
            budgetId,
            category,
            forecastDays: parseInt(forecastDays) || 30,
            method: method || 'ensemble',
            historicalDays: parseInt(historicalDays) || 90
        });

        res.json({ success: true, data: forecast });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get All Forecasts
 */
router.get('/forecasts', auth, async (req, res) => {
    try {
        const { budgetId, category, status, limit } = req.query;

        const query = { userId: req.user._id };
        if (budgetId) query.budgetId = budgetId;
        if (category) query.category = category;
        if (status) query.status = status;
        else query.status = 'active';

        const forecasts = await SpendForecast.find(query)
            .sort({ forecastDate: -1 })
            .limit(parseInt(limit) || 20);

        res.json({ success: true, data: forecasts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Specific Forecast
 */
router.get('/forecasts/:id', auth, async (req, res) => {
    try {
        const forecast = await SpendForecast.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!forecast) {
            return res.status(404).json({ success: false, error: 'Forecast not found' });
        }

        res.json({ success: true, data: forecast });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Calculate Forecast Accuracy
 */
router.post('/forecast/accuracy/:forecastId', auth, async (req, res) => {
    try {
        const accuracy = await spendForecaster.calculateAccuracy(req.params.forecastId);

        if (!accuracy) {
            return res.status(404).json({ success: false, error: 'Forecast not found' });
        }

        res.json({ success: true, data: accuracy });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Budget Optimization Recommendations
 */
router.get('/optimize/:budgetId', auth, async (req, res) => {
    try {
        const recommendations = await budgetOptimizer.generateRecommendations(
            req.user._id,
            req.params.budgetId
        );

        res.json({ success: true, data: recommendations });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Apply Optimization Recommendations
 */
router.post('/optimize/:budgetId/apply', auth, async (req, res) => {
    try {
        const { recommendationIds } = req.body;

        if (!Array.isArray(recommendationIds)) {
            return res.status(400).json({
                success: false,
                error: 'recommendationIds must be an array'
            });
        }

        const result = await budgetOptimizer.applyRecommendations(
            req.user._id,
            req.params.budgetId,
            recommendationIds
        );

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Optimization History
 */
router.get('/optimize/:budgetId/history', auth, async (req, res) => {
    try {
        const history = await budgetOptimizer.getOptimizationHistory(
            req.user._id,
            req.params.budgetId
        );

        res.json({ success: true, data: history });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Critical Alerts
 */
router.get('/alerts/critical', auth, async (req, res) => {
    try {
        const variances = await BudgetVariance.find({
            userId: req.user._id,
            'alerts.severity': { $in: ['critical', 'high'] }
        }).sort({ analysisDate: -1 }).limit(20);

        const alerts = variances.flatMap(v =>
            v.alerts
                .filter(a => a.severity === 'critical' || a.severity === 'high')
                .map(a => ({
                    ...a.toObject(),
                    budgetName: v.budgetName,
                    analysisDate: v.analysisDate
                }))
        );

        res.json({ success: true, data: alerts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
