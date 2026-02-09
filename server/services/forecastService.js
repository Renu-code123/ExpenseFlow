const Forecast = require('../models/Forecast');
const Expense = require('../models/Expense');
const Budget = require('../models/Budget');

/**
 * Advanced Budget Forecasting Service
 * Implements predictive analytics using statistical models
 */
class ForecastService {
    /**
     * Generate forecast for a user
     * @param {string} userId - User ID
     * @param {Object} options - Forecasting options
     * @returns {Object} Forecast data
     */
    async generateForecast(userId, options = {}) {
        const {
            periodType = 'monthly',
            category = null,
            algorithm = 'moving_average',
            confidenceLevel = 95,
            historicalPeriods = 12
        } = options;

        // Get historical data
        const historicalData = await this.getHistoricalData(userId, category, historicalPeriods);

        if (historicalData.length < 3) {
            throw new Error('Insufficient historical data for forecasting (minimum 3 periods required)');
        }

        // Generate predictions based on algorithm
        let predictions = [];
        switch (algorithm) {
            case 'moving_average':
                predictions = this.movingAverageForecast(historicalData, periodType, confidenceLevel);
                break;
            case 'linear_regression':
                predictions = this.linearRegressionForecast(historicalData, periodType, confidenceLevel);
                break;
            case 'exponential_smoothing':
                predictions = this.exponentialSmoothingForecast(historicalData, periodType, confidenceLevel);
                break;
            default:
                predictions = this.movingAverageForecast(historicalData, periodType, confidenceLevel);
        }

        // Calculate aggregate forecast
        const aggregateForecast = this.calculateAggregateForecast(predictions);

        // Detect seasonal factors
        const seasonalFactors = this.detectSeasonalFactors(historicalData);

        // Generate alerts and recommendations
        const alerts = await this.generateAlerts(userId, predictions, category);
        const recommendations = this.generateRecommendations(predictions, aggregateForecast);

        // Create forecast record
        const forecast = new Forecast({
            user: userId,
            parameters: {
                period_type: periodType,
                category,
                algorithm,
                confidence_level: confidenceLevel,
                historical_periods: historicalPeriods
            },
            results: {
                predictions,
                aggregate_forecast: aggregateForecast,
                seasonal_factors: seasonalFactors
            },
            alerts,
            recommendations
        });

        await forecast.save();
        return forecast;
    }

    /**
     * Get historical expense data for forecasting
     * @param {string} userId - User ID
     * @param {string} category - Category filter
     * @param {number} periods - Number of historical periods
     * @returns {Array} Historical data points
     */
    async getHistoricalData(userId, category, periods) {
        const now = new Date();
        const startDate = new Date();

        // Calculate start date based on period type (assuming monthly for simplicity)
        startDate.setMonth(now.getMonth() - periods);

        const matchConditions = {
            user: userId,
            date: { $gte: startDate, $lt: now }
        };

        if (category) {
            matchConditions.category = category;
        }

        const historicalData = await Expense.aggregate([
            { $match: matchConditions },
            {
                $group: {
                    _id: {
                        year: { $year: '$date' },
                        month: { $month: '$date' }
                    },
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            }
        ]);

        return historicalData.map(item => ({
            date: new Date(item._id.year, item._id.month - 1, 1),
            amount: item.total,
            count: item.count
        }));
    }

    /**
     * Moving Average forecasting algorithm
     * @param {Array} historicalData - Historical data points
     * @param {string} periodType - Forecast period type
     * @param {number} confidenceLevel - Confidence level
     * @returns {Array} Predictions
     */
    movingAverageForecast(historicalData, periodType, confidenceLevel) {
        const windowSize = Math.min(3, historicalData.length);
        const predictions = [];
        const now = new Date();

        // Calculate moving average
        const amounts = historicalData.map(d => d.amount);
        const movingAvg = amounts.slice(-windowSize).reduce((a, b) => a + b, 0) / windowSize;

        // Calculate standard deviation for confidence intervals
        const variance = amounts.slice(-windowSize).reduce((acc, val) => acc + Math.pow(val - movingAvg, 2), 0) / windowSize;
        const stdDev = Math.sqrt(variance);
        const zScore = this.getZScore(confidenceLevel);

        // Generate predictions
        const periods = this.getForecastPeriods(periodType);
        for (let i = 1; i <= periods; i++) {
            const forecastDate = new Date(now);
            this.addPeriod(forecastDate, periodType, i);

            predictions.push({
                date: forecastDate,
                predicted_amount: Math.round(movingAvg * 100) / 100,
                confidence_lower: Math.round((movingAvg - zScore * stdDev) * 100) / 100,
                confidence_upper: Math.round((movingAvg + zScore * stdDev) * 100) / 100
            });
        }

        return predictions;
    }

    /**
     * Linear Regression forecasting algorithm
     * @param {Array} historicalData - Historical data points
     * @param {string} periodType - Forecast period type
     * @param {number} confidenceLevel - Confidence level
     * @returns {Array} Predictions
     */
    linearRegressionForecast(historicalData, periodType, confidenceLevel) {
        const n = historicalData.length;
        const x = Array.from({ length: n }, (_, i) => i + 1);
        const y = historicalData.map(d => d.amount);

        // Calculate linear regression coefficients
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
        const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Calculate predictions
        const predictions = [];
        const now = new Date();
        const periods = this.getForecastPeriods(periodType);

        for (let i = 1; i <= periods; i++) {
            const forecastDate = new Date(now);
            this.addPeriod(forecastDate, periodType, i);

            const xValue = n + i;
            const predicted = slope * xValue + intercept;
            const roundedPrediction = Math.round(Math.max(0, predicted) * 100) / 100;

            predictions.push({
                date: forecastDate,
                predicted_amount: roundedPrediction,
                confidence_lower: Math.round(roundedPrediction * 0.8 * 100) / 100, // Simplified confidence
                confidence_upper: Math.round(roundedPrediction * 1.2 * 100) / 100
            });
        }

        return predictions;
    }

    /**
     * Exponential Smoothing forecasting algorithm
     * @param {Array} historicalData - Historical data points
     * @param {string} periodType - Forecast period type
     * @param {number} confidenceLevel - Confidence level
     * @returns {Array} Predictions
     */
    exponentialSmoothingForecast(historicalData, periodType, confidenceLevel) {
        const alpha = 0.3; // Smoothing parameter
        const amounts = historicalData.map(d => d.amount);

        // Calculate smoothed values
        let smoothed = amounts[0];
        for (let i = 1; i < amounts.length; i++) {
            smoothed = alpha * amounts[i] + (1 - alpha) * smoothed;
        }

        // Calculate standard deviation
        const variance = amounts.reduce((acc, val) => acc + Math.pow(val - smoothed, 2), 0) / amounts.length;
        const stdDev = Math.sqrt(variance);
        const zScore = this.getZScore(confidenceLevel);

        // Generate predictions
        const predictions = [];
        const now = new Date();
        const periods = this.getForecastPeriods(periodType);

        for (let i = 1; i <= periods; i++) {
            const forecastDate = new Date(now);
            this.addPeriod(forecastDate, periodType, i);

            predictions.push({
                date: forecastDate,
                predicted_amount: Math.round(smoothed * 100) / 100,
                confidence_lower: Math.round((smoothed - zScore * stdDev) * 100) / 100,
                confidence_upper: Math.round((smoothed + zScore * stdDev) * 100) / 100
            });
        }

        return predictions;
    }

    /**
     * Calculate aggregate forecast metrics
     * @param {Array} predictions - Prediction data
     * @returns {Object} Aggregate forecast
     */
    calculateAggregateForecast(predictions) {
        const totalPredicted = predictions.reduce((sum, p) => sum + p.predicted_amount, 0);
        const averageMonthly = totalPredicted / predictions.length;

        // Simple trend analysis
        const firstHalf = predictions.slice(0, Math.floor(predictions.length / 2));
        const secondHalf = predictions.slice(Math.floor(predictions.length / 2));

        const firstAvg = firstHalf.reduce((sum, p) => sum + p.predicted_amount, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, p) => sum + p.predicted_amount, 0) / secondHalf.length;

        let trend = 'stable';
        let trendPercentage = 0;

        if (secondAvg > firstAvg * 1.05) {
            trend = 'increasing';
            trendPercentage = ((secondAvg - firstAvg) / firstAvg) * 100;
        } else if (secondAvg < firstAvg * 0.95) {
            trend = 'decreasing';
            trendPercentage = ((firstAvg - secondAvg) / firstAvg) * 100;
        }

        return {
            total_predicted: Math.round(totalPredicted * 100) / 100,
            average_monthly: Math.round(averageMonthly * 100) / 100,
            trend,
            trend_percentage: Math.round(trendPercentage * 100) / 100
        };
    }

    /**
     * Detect seasonal spending patterns
     * @param {Array} historicalData - Historical data
     * @returns {Array} Seasonal factors
     */
    detectSeasonalFactors(historicalData) {
        const monthlyTotals = Array(12).fill(0);
        const monthlyCounts = Array(12).fill(0);

        historicalData.forEach(data => {
            const month = data.date.getMonth();
            monthlyTotals[month] += data.amount;
            monthlyCounts[month]++;
        });

        const overallAverage = monthlyTotals.reduce((a, b) => a + b, 0) / 12;

        const seasonalFactors = [];
        for (let i = 0; i < 12; i++) {
            const monthlyAvg = monthlyCounts[i] > 0 ? monthlyTotals[i] / monthlyCounts[i] : overallAverage;
            const factor = monthlyAvg / overallAverage;
            seasonalFactors.push({
                month: i + 1,
                factor: Math.round(factor * 100) / 100
            });
        }

        return seasonalFactors;
    }

    /**
     * Generate alerts based on forecast
     * @param {string} userId - User ID
     * @param {Array} predictions - Predictions
     * @param {string} category - Category
     * @returns {Array} Alerts
     */
    async generateAlerts(userId, predictions, category) {
        const alerts = [];

        // Check against budgets
        const budgets = await Budget.find({
            user: userId,
            ...(category && { category })
        });

        budgets.forEach(budget => {
            const totalPredicted = predictions.reduce((sum, p) => sum + p.predicted_amount, 0);
            if (totalPredicted > budget.amount * 1.1) { // 10% over budget
                alerts.push({
                    alert_type: 'budget_exceed',
                    severity: 'high',
                    message: `Forecast indicates spending will exceed budget by $${(totalPredicted - budget.amount).toFixed(2)}`
                });
            }
        });

        // Trend change alerts
        const aggregate = this.calculateAggregateForecast(predictions);
        if (aggregate.trend === 'increasing' && aggregate.trend_percentage > 20) {
            alerts.push({
                alert_type: 'trend_change',
                severity: 'medium',
                message: `Spending trend is increasing by ${aggregate.trend_percentage.toFixed(1)}%`
            });
        }

        return alerts;
    }

    /**
     * Generate recommendations based on forecast
     * @param {Array} predictions - Predictions
     * @param {Object} aggregate - Aggregate forecast
     * @returns {Array} Recommendations
     */
    generateRecommendations(predictions, aggregate) {
        const recommendations = [];

        if (aggregate.trend === 'increasing') {
            recommendations.push({
                type: 'spending_reduction',
                description: 'Consider reviewing subscriptions and discretionary spending to control increasing trend',
                priority: 'high'
            });
        }

        if (aggregate.trend === 'decreasing') {
            recommendations.push({
                type: 'budget_adjustment',
                description: 'Consider adjusting budget downward to reflect decreasing spending trend',
                priority: 'medium'
            });
        }

        const highVariance = predictions.some(p =>
            p.confidence_upper - p.confidence_lower > p.predicted_amount * 0.5
        );

        if (highVariance) {
            recommendations.push({
                type: 'category_review',
                description: 'High variance detected - review spending patterns for better predictability',
                priority: 'medium'
            });
        }

        return recommendations;
    }

    /**
     * Get Z-score for confidence level
     * @param {number} confidenceLevel - Confidence level (80, 90, 95, 99)
     * @returns {number} Z-score
     */
    getZScore(confidenceLevel) {
        const zScores = {
            80: 1.28,
            90: 1.645,
            95: 1.96,
            99: 2.576
        };
        return zScores[confidenceLevel] || 1.96;
    }

    /**
     * Get number of forecast periods
     * @param {string} periodType - Period type
     * @returns {number} Number of periods
     */
    getForecastPeriods(periodType) {
        const periods = {
            weekly: 4,
            monthly: 3,
            quarterly: 4,
            yearly: 1
        };
        return periods[periodType] || 3;
    }

    /**
     * Add period to date
     * @param {Date} date - Date to modify
     * @param {string} periodType - Period type
     * @param {number} periods - Number of periods to add
     */
    addPeriod(date, periodType, periods) {
        switch (periodType) {
            case 'weekly':
                date.setDate(date.getDate() + periods * 7);
                break;
            case 'monthly':
                date.setMonth(date.getMonth() + periods);
                break;
            case 'quarterly':
                date.setMonth(date.getMonth() + periods * 3);
                break;
            case 'yearly':
                date.setFullYear(date.getFullYear() + periods);
                break;
        }
    }

    /**
     * Get forecast summary for dashboard
     * @param {string} userId - User ID
     * @returns {Object} Summary data
     */
    async getForecastSummary(userId) {
        const forecasts = await Forecast.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(10);

        const summary = {
            total_forecasts: forecasts.length,
            total_predicted_spending: 0,
            categories: [],
            alerts: { critical: 0, high: 0, medium: 0, low: 0, total_unacknowledged: 0 },
            accuracy: { overall: 0, by_category: {} }
        };

        forecasts.forEach(forecast => {
            summary.total_predicted_spending += forecast.results.aggregate_forecast.total_predicted || 0;

            if (forecast.parameters.category) {
                const categoryData = summary.categories.find(c => c.category === forecast.parameters.category);
                if (categoryData) {
                    categoryData.predicted += forecast.results.aggregate_forecast.total_predicted;
                } else {
                    summary.categories.push({
                        category: forecast.parameters.category,
                        predicted: forecast.results.aggregate_forecast.total_predicted,
                        trend: forecast.results.aggregate_forecast.trend,
                        accuracy: forecast.results.accuracy_score
                    });
                }
            }

            // Count alerts
            forecast.alerts.forEach(alert => {
                if (!alert.acknowledged) {
                    summary.alerts[alert.severity]++;
                    summary.alerts.total_unacknowledged++;
                }
            });

            // Track accuracy
            if (forecast.results.accuracy_score) {
                summary.accuracy.overall += forecast.results.accuracy_score;
                if (forecast.parameters.category) {
                    summary.accuracy.by_category[forecast.parameters.category] = forecast.results.accuracy_score;
                }
            }
        });

        if (forecasts.length > 0) {
            summary.accuracy.overall = Math.round(summary.accuracy.overall / forecasts.length);
        }

        summary.total_predicted_spending = Math.round(summary.total_predicted_spending * 100) / 100;

        return summary;
    }
}

module.exports = new ForecastService();
