const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const revaluationEngine = require('../services/revaluationEngine');
const fxGainLossService = require('../services/fxGainLossService');
const FXRevaluation = require('../models/FXRevaluation');
const UnrealizedGainLoss = require('../models/UnrealizedGainLoss');

/**
 * Get FX Revaluation Dashboard
 */
router.get('/dashboard', auth, async (req, res) => {
    try {
        const dashboard = await revaluationEngine.getRevaluationDashboard(req.user._id);
        res.json({ success: true, data: dashboard });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Run FX Revaluation
 */
router.post('/run', auth, async (req, res) => {
    try {
        const { baseCurrency, revaluationType } = req.body;

        const revaluation = await revaluationEngine.runRevaluation(
            req.user._id,
            baseCurrency || 'INR',
            revaluationType || 'manual'
        );

        res.json({ success: true, data: revaluation });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get All Revaluations
 */
router.get('/revaluations', auth, async (req, res) => {
    try {
        const { startDate, endDate, limit } = req.query;

        const query = { userId: req.user._id, status: 'completed' };

        if (startDate && endDate) {
            query.revaluationDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const revaluations = await FXRevaluation.find(query)
            .sort({ revaluationDate: -1 })
            .limit(parseInt(limit) || 50);

        res.json({ success: true, data: revaluations });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Specific Revaluation
 */
router.get('/revaluations/:id', auth, async (req, res) => {
    try {
        const revaluation = await FXRevaluation.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!revaluation) {
            return res.status(404).json({ success: false, error: 'Revaluation not found' });
        }

        res.json({ success: true, data: revaluation });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Unrealized Positions
 */
router.get('/unrealized-positions', auth, async (req, res) => {
    try {
        const { currency, status } = req.query;

        const query = { userId: req.user._id };

        if (currency) query.currency = currency;
        if (status) query.status = status;
        else query.status = 'active';

        const positions = await UnrealizedGainLoss.find(query)
            .sort({ unrealizedGainLoss: -1 });

        res.json({ success: true, data: positions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Total Gain/Loss
 */
router.get('/gain-loss/total', auth, async (req, res) => {
    try {
        const { asOfDate } = req.query;

        const totals = await fxGainLossService.calculateTotalGainLoss(
            req.user._id,
            asOfDate ? new Date(asOfDate) : new Date()
        );

        res.json({ success: true, data: totals });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Gain/Loss by Currency
 */
router.get('/gain-loss/by-currency', auth, async (req, res) => {
    try {
        const byCurrency = await fxGainLossService.getGainLossByCurrency(req.user._id);
        res.json({ success: true, data: byCurrency });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Gain/Loss Trend
 */
router.get('/gain-loss/trend', auth, async (req, res) => {
    try {
        const { months } = req.query;

        const trend = await fxGainLossService.getGainLossTrend(
            req.user._id,
            parseInt(months) || 12
        );

        res.json({ success: true, data: trend });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Top Positions
 */
router.get('/gain-loss/top-positions', auth, async (req, res) => {
    try {
        const { limit } = req.query;

        const topPositions = await fxGainLossService.getTopPositions(
            req.user._id,
            parseInt(limit) || 10
        );

        res.json({ success: true, data: topPositions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Calculate Value at Risk (VaR)
 */
router.get('/risk/var', auth, async (req, res) => {
    try {
        const { confidenceLevel, timeHorizon } = req.query;

        const var95 = await fxGainLossService.calculateVaR(
            req.user._id,
            parseFloat(confidenceLevel) || 0.95,
            parseInt(timeHorizon) || 1
        );

        res.json({ success: true, data: var95 });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Sensitivity Analysis
 */
router.get('/risk/sensitivity', auth, async (req, res) => {
    try {
        const scenarios = await fxGainLossService.getSensitivityAnalysis(req.user._id);
        res.json({ success: true, data: scenarios });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Generate Compliance Report
 */
router.post('/reports/compliance', auth, async (req, res) => {
    try {
        const { startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'Start date and end date are required'
            });
        }

        const report = await fxGainLossService.generateComplianceReport(
            req.user._id,
            { startDate, endDate }
        );

        res.json({ success: true, data: report });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Revaluation Report
 */
router.get('/reports/revaluation', auth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'Start date and end date are required'
            });
        }

        const report = await revaluationEngine.getRevaluationReport(
            req.user._id,
            startDate,
            endDate
        );

        res.json({ success: true, data: report });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Realize Gain/Loss
 */
router.post('/realize/:accountId', auth, async (req, res) => {
    try {
        const { accountType } = req.body;

        const position = await revaluationEngine.realizeGainLoss(
            req.user._id,
            req.params.accountId,
            accountType
        );

        if (!position) {
            return res.status(404).json({
                success: false,
                error: 'No active position found for this account'
            });
        }

        res.json({ success: true, data: position });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
