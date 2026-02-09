const express = require('express');
const router = express.Router();
const budgetForecastingService = require('../services/budgetForecastingService');
const anomalyDetectionService = require('../services/anomalyDetectionService');
const auth = require('../middleware/auth');
const forecastValidator = require('../middleware/forecastValidator');

/**
 * BUDGET FORECASTING ROUTES
 */

/**
 * @route   POST /api/forecasting/generate
 * @desc    Generate budget forecast
 * @access  Private
 */
router.post('/generate', 
    auth, 
    forecastValidator.validateForecastGeneration,
    async (req, res) => {
        try {
            const { period_type, category, algorithm, confidence_level } = req.body;
            
            const forecast = await budgetForecastingService.generateForecast(
                req.user.id,
                {
                    periodType: period_type,
                    category,
                    algorithm,
                    confidenceLevel: confidence_level
                }
            );
            
            res.json({
                success: true,
                message: 'Forecast generated successfully',
                data: forecast
            });
        } catch (error) {
            console.error('Generate forecast error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to generate forecast'
            });
        }
    }
);

/**
 * @route   GET /api/forecasting/forecasts
 * @desc    Get all user forecasts
 * @access  Private
 */
router.get('/forecasts', auth, async (req, res) => {
    try {
        const { category, period_type } = req.query;
        
        const forecasts = await budgetForecastingService.getUserForecasts(
            req.user.id,
            { category, periodType: period_type }
        );
        
        res.json({
            success: true,
            count: forecasts.length,
            data: forecasts
        });
    } catch (error) {
        console.error('Get forecasts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve forecasts'
        });
    }
});

/**
 * @route   GET /api/forecasting/forecasts/:id
 * @desc    Get specific forecast by ID
 * @access  Private
 */
router.get('/forecasts/:id', auth, async (req, res) => {
    try {
        const forecast = await budgetForecastingService.getForecastById(
            req.params.id,
            req.user.id
        );
        
        res.json({
            success: true,
            data: forecast
        });
    } catch (error) {
        console.error('Get forecast error:', error);
        res.status(404).json({
            success: false,
            message: error.message || 'Forecast not found'
        });
    }
});

/**
 * @route   GET /api/forecasting/summary
 * @desc    Get forecast summary for dashboard
 * @access  Private
 */
router.get('/summary', auth, async (req, res) => {
    try {
        const summary = await budgetForecastingService.getForecastSummary(req.user.id);
        
        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error('Get summary error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve forecast summary'
        });
    }
});

/**
 * @route   PUT /api/forecasting/forecasts/:id/acknowledge-alert/:alertId
 * @desc    Acknowledge a forecast alert
 * @access  Private
 */
router.put('/forecasts/:id/acknowledge-alert/:alertId', auth, async (req, res) => {
    try {
        const forecast = await budgetForecastingService.getForecastById(
            req.params.id,
            req.user.id
        );
        
        await forecast.acknowledgeAlert(req.params.alertId);
        
        res.json({
            success: true,
            message: 'Alert acknowledged',
            data: forecast
        });
    } catch (error) {
        console.error('Acknowledge alert error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to acknowledge alert'
        });
    }
});

/**
 * @route   POST /api/forecasting/update-accuracy
 * @desc    Update forecast accuracy with actual data
 * @access  Private
 */
router.post('/update-accuracy', auth, async (req, res) => {
    try {
        const result = await budgetForecastingService.updateForecastAccuracy(req.user.id);
        
        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        console.error('Update accuracy error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update forecast accuracy'
        });
    }
});

/**
 * ANOMALY DETECTION ROUTES
 */

/**
 * @route   POST /api/forecasting/anomalies/detect
 * @desc    Run anomaly detection on recent transactions
 * @access  Private
 */
router.post('/anomalies/detect',
    auth,
    forecastValidator.validateAnomalyDetection,
    async (req, res) => {
        try {
            const { lookback_days, sensitivity_level } = req.body;
            
            const result = await anomalyDetectionService.detectAnomalies(
                req.user.id,
                {
                    lookbackDays: lookback_days || 90,
                    sensitivityLevel: sensitivity_level || 'medium'
                }
            );
            
            res.json({
                success: true,
                message: `Detected ${result.detected} anomalies`,
                data: result
            });
        } catch (error) {
            console.error('Detect anomalies error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to detect anomalies'
            });
        }
    }
);

/**
 * @route   GET /api/forecasting/anomalies
 * @desc    Get user's spending anomalies
 * @access  Private
 */
router.get('/anomalies', auth, async (req, res) => {
    try {
        const { severity, unreviewed, potential_fraud } = req.query;
        
        const filters = {
            severity,
            unreviewed: unreviewed === 'true',
            potentialFraud: potential_fraud === 'true'
        };
        
        const anomalies = await anomalyDetectionService.getUserAnomalies(
            req.user.id,
            filters
        );
        
        res.json({
            success: true,
            count: anomalies.length,
            data: anomalies
        });
    } catch (error) {
        console.error('Get anomalies error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve anomalies'
        });
    }
});

/**
 * @route   GET /api/forecasting/anomalies/stats
 * @desc    Get anomaly statistics
 * @access  Private
 */
router.get('/anomalies/stats', auth, async (req, res) => {
    try {
        const { period } = req.query;
        
        const stats = await anomalyDetectionService.getAnomalyStats(
            req.user.id,
            period ? parseInt(period) : 30
        );
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Get anomaly stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve anomaly statistics'
        });
    }
});

/**
 * @route   GET /api/forecasting/anomalies/insights
 * @desc    Get anomaly detection insights
 * @access  Private
 */
router.get('/anomalies/insights', auth, async (req, res) => {
    try {
        const insights = await anomalyDetectionService.getInsights(req.user.id);
        
        res.json({
            success: true,
            data: insights
        });
    } catch (error) {
        console.error('Get insights error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve insights'
        });
    }
});

/**
 * @route   POST /api/forecasting/anomalies/:expenseId/analyze
 * @desc    Analyze specific transaction for anomalies
 * @access  Private
 */
router.post('/anomalies/:expenseId/analyze', auth, async (req, res) => {
    try {
        const result = await anomalyDetectionService.analyzeTransaction(
            req.user.id,
            req.params.expenseId
        );
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Analyze transaction error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to analyze transaction'
        });
    }
});

/**
 * @route   PUT /api/forecasting/anomalies/:id/review
 * @desc    Review and mark anomaly
 * @access  Private
 */
router.put('/anomalies/:id/review',
    auth,
    forecastValidator.validateAnomalyReview,
    async (req, res) => {
        try {
            const { action, notes } = req.body;
            
            const anomaly = await anomalyDetectionService.reviewAnomaly(
                req.user.id,
                req.params.id,
                action
            );
            
            if (notes) {
                anomaly.user_actions.notes = notes;
                await anomaly.save();
            }
            
            res.json({
                success: true,
                message: 'Anomaly reviewed successfully',
                data: anomaly
            });
        } catch (error) {
            console.error('Review anomaly error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to review anomaly'
            });
        }
    }
);

/**
 * PATTERN ANALYSIS ROUTES
 */

/**
 * @route   GET /api/forecasting/patterns/seasonal
 * @desc    Get seasonal spending patterns
 * @access  Private
 */
router.get('/patterns/seasonal', auth, async (req, res) => {
    try {
        const { category } = req.query;
        
        // Generate a forecast to get seasonal patterns
        const forecast = await budgetForecastingService.generateForecast(
            req.user.id,
            {
                periodType: 'yearly',
                category: category || null
            }
        );
        
        res.json({
            success: true,
            data: {
                seasonal_factors: forecast.seasonal_factors,
                forecast_period: forecast.forecast_period
            }
        });
    } catch (error) {
        console.error('Get seasonal patterns error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve seasonal patterns'
        });
    }
});

/**
 * @route   GET /api/forecasting/patterns/trends
 * @desc    Get spending trends
 * @access  Private
 */
router.get('/patterns/trends', auth, async (req, res) => {
    try {
        const forecasts = await budgetForecastingService.getUserForecasts(req.user.id);
        
        const trends = forecasts.map(forecast => ({
            category: forecast.category || 'All Categories',
            trend: forecast.aggregate_forecast.trend,
            trend_percentage: forecast.aggregate_forecast.trend_percentage,
            period: forecast.forecast_period.period_type
        }));
        
        res.json({
            success: true,
            data: trends
        });
    } catch (error) {
        console.error('Get trends error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve trends'
        });
    }
});

/**
 * ALERT MANAGEMENT ROUTES
 */

/**
 * @route   GET /api/forecasting/alerts
 * @desc    Get all unacknowledged alerts
 * @access  Private
 */
router.get('/alerts', auth, async (req, res) => {
    try {
        const { severity } = req.query;
        
        const forecasts = await budgetForecastingService.getUserForecasts(req.user.id);
        
        let allAlerts = [];
        forecasts.forEach(forecast => {
            const forecastAlerts = forecast.alerts
                .filter(alert => !alert.acknowledged)
                .map(alert => ({
                    ...alert.toObject(),
                    forecast_id: forecast._id,
                    forecast_category: forecast.category
                }));
            
            allAlerts = allAlerts.concat(forecastAlerts);
        });
        
        // Filter by severity if provided
        if (severity) {
            allAlerts = allAlerts.filter(alert => alert.severity === severity);
        }
        
        // Sort by severity and date
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        allAlerts.sort((a, b) => {
            if (severityOrder[a.severity] !== severityOrder[b.severity]) {
                return severityOrder[a.severity] - severityOrder[b.severity];
            }
            return b.triggered_at - a.triggered_at;
        });
        
        res.json({
            success: true,
            count: allAlerts.length,
            data: allAlerts
        });
    } catch (error) {
        console.error('Get alerts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve alerts'
        });
    }
});

module.exports = router;
