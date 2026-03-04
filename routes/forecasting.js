const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const forecastingEngine = require('../services/forecastingEngine');
const forecastingService = require('../services/forecastingService');
const ForecastScenario = require('../models/ForecastScenario');
const SimulationEngine = require('../services/simulationEngine');
const runwayAlertGuard = require('../middleware/runwayAlertGuard');


/**
 * @route   POST /api/forecasting/run
 * @desc    Run a probabilistic cash-flow simulation
 */
router.post('/run', auth, async (req, res) => {
    try {
        const { scenarioId } = req.body;
        let scenario = null;

        if (scenarioId) {
            scenario = await ForecastScenario.findOne({ _id: scenarioId, user: req.user._id });
        }

        const results = await forecastingEngine.runSimulation(req.user._id, scenario);

        // Update scenario last results if it exists
        if (scenario) {
            scenario.lastRunAt = new Date();
            scenario.lastResultSnapshot = results.summary;
            await scenario.save();
        }

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/forecasting/monte-carlo
 * @desc    Run Monte Carlo simulation (Issue #798)
 */
router.post('/monte-carlo', auth, async (req, res) => {
    try {
        const {
            simulations = 10000,
            horizonDays = 90,
            scenarioAdjustments = null,
            includeStressTest = false
        } = req.body;

        const results = await forecastingService.runProbabilisticForecast(req.user._id, {
            simulations: Math.min(simulations, 50000), // Cap at 50K for performance
            horizonDays: Math.min(horizonDays, 365),
            scenarioAdjustments,
            includeStressTest
        });

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/forecasting/fan-chart
 * @desc    Get fan chart data for confidence interval visualization
 */
router.get('/fan-chart', auth, async (req, res) => {
    try {
        const horizonDays = parseInt(req.query.days) || 30;
        const simulations = parseInt(req.query.simulations) || 5000;

        const data = await forecastingService.getFanChartData(req.user._id, {
            horizonDays: Math.min(horizonDays, 90),
            simulations: Math.min(simulations, 10000)
        });

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/forecasting/histogram
 * @desc    Get runway distribution histogram
 */
router.get('/histogram', auth, async (req, res) => {
    try {
        const data = await forecastingService.getRunwayHistogram(req.user._id);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/forecasting/stress-test
 * @desc    Run stress test scenarios
 */
router.post('/stress-test', auth, async (req, res) => {
    try {
        const {
            scenarios = ['recession', 'income_loss', 'expense_spike'],
            horizonDays = 90
        } = req.body;

        const results = await SimulationEngine.runStressTest(req.user._id, {
            horizonDays: Math.min(horizonDays, 180),
            scenarios
        });

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/forecasting/quick-simulation
 * @desc    Quick simulation for real-time UI updates
 */
router.get('/quick-simulation', auth, async (req, res) => {
    try {
        const data = await SimulationEngine.quickSimulation(req.user._id);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/forecasting/runway-alert
 * @desc    Check runway alert status based on P10
 */
router.get('/runway-alert', auth, async (req, res) => {
    try {
        const alertStatus = await runwayAlertGuard.checkRunwayAlerts(req.user._id);
        res.json({ success: true, data: alertStatus });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/forecasting/scenarios
 * @desc    Create a new what-if scenario
 */
router.post('/scenarios', auth, async (req, res) => {
    try {
        const scenario = new ForecastScenario({
            ...req.body,
            user: req.user._id
        });
        await scenario.save();
        res.status(201).json({ success: true, data: scenario });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/forecasting/scenarios
 * @desc    Get user scenarios
 */
router.get('/scenarios', auth, async (req, res) => {
    try {
        const scenarios = await ForecastScenario.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, data: scenarios });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
