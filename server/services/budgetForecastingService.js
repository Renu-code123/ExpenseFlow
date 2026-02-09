const BudgetForecast = require('../models/BudgetForecast');
const Expense = require('../models/Expense');
const Budget = require('../models/Budget');

/**
 * Budget Forecasting Service
 * Implements time-series forecasting and predictive analytics
 */

class BudgetForecastingService {
    
    /**
     * Generate forecast for a specific period
     */
    async generateForecast(userId, options = {}) {
        const {
            periodType = 'monthly',
            category = null,
            algorithm = 'moving_average',
            confidenceLevel = 95
        } = options;
        
        // Calculate period dates
        const periods = this._calculatePeriods(periodType);
        
        // Get historical data
        const historicalData = await this._getHistoricalData(
            userId,
            category,
            periods.historicalStart,
            periods.historicalEnd
        );
        
        if (historicalData.length < 3) {
            throw new Error('Insufficient historical data for forecasting (minimum 3 periods required)');
        }
        
        // Generate predictions based on algorithm
        let predictions, modelMetadata;
        
        switch (algorithm) {
            case 'linear_regression':
                ({ predictions, modelMetadata } = this._linearRegressionForecast(historicalData, periods, confidenceLevel));
                break;
            case 'exponential_smoothing':
                ({ predictions, modelMetadata } = this._exponentialSmoothingForecast(historicalData, periods, confidenceLevel));
                break;
            case 'moving_average':
            default:
                ({ predictions, modelMetadata } = this._movingAverageForecast(historicalData, periods, confidenceLevel));
        }
        
        // Analyze trend
        const aggregateForecast = this._calculateAggregateForecast(predictions, historicalData);
        
        // Detect seasonal factors
        const seasonalFactors = this._detectSeasonalFactors(historicalData);
        
        // Compare with budget
        const comparison = await this._compareForecastToBudget(userId, category, predictions, periodType);
        
        // Generate recommendations
        const recommendations = this._generateRecommendations(predictions, comparison, aggregateForecast);
        
        // Generate alerts
        const alerts = this._generateAlerts(predictions, comparison, aggregateForecast);
        
        // Create forecast record
        const forecast = new BudgetForecast({
            user: userId,
            forecast_period: {
                start_date: periods.forecastStart,
                end_date: periods.forecastEnd,
                period_type: periodType
            },
            category,
            predictions,
            aggregate_forecast: aggregateForecast,
            seasonal_factors: seasonalFactors,
            model_metadata: {
                ...modelMetadata,
                algorithm,
                training_data_points: historicalData.length,
                last_trained: new Date()
            },
            comparison,
            recommendations,
            alerts
        });
        
        await forecast.save();
        return forecast;
    }
    
    /**
     * Get forecast by ID
     */
    async getForecastById(forecastId, userId) {
        const forecast = await BudgetForecast.findOne({
            _id: forecastId,
            user: userId
        });
        
        if (!forecast) {
            throw new Error('Forecast not found');
        }
        
        return forecast;
    }
    
    /**
     * Get all active forecasts for user
     */
    async getUserForecasts(userId, filters = {}) {
        const query = { user: userId, status: 'active' };
        
        if (filters.category) {
            query.category = filters.category;
        }
        
        if (filters.periodType) {
            query['forecast_period.period_type'] = filters.periodType;
        }
        
        return await BudgetForecast.find(query)
            .sort({ 'forecast_period.start_date': -1 });
    }
    
    /**
     * Update forecast accuracy with actual data
     */
    async updateForecastAccuracy(userId) {
        const activeForecasts = await BudgetForecast.find({
            user: userId,
            status: 'active'
        });
        
        for (const forecast of activeForecasts) {
            for (const prediction of forecast.predictions) {
                // Skip future predictions
                if (prediction.date > new Date()) continue;
                
                // Check if already tracked
                const alreadyTracked = forecast.accuracy_tracking.some(
                    t => t.prediction_date.toDateString() === prediction.date.toDateString()
                );
                
                if (alreadyTracked) continue;
                
                // Get actual spending for prediction date
                const actualAmount = await this._getActualSpending(
                    userId,
                    forecast.category,
                    prediction.date
                );
                
                if (actualAmount !== null) {
                    await forecast.trackAccuracy(
                        prediction.date,
                        prediction.predicted_amount,
                        actualAmount
                    );
                }
            }
        }
        
        return { message: 'Forecast accuracy updated' };
    }
    
    /**
     * Get forecast summary for dashboard
     */
    async getForecastSummary(userId) {
        const currentForecasts = await BudgetForecast.getCurrentForecasts(userId);
        
        const summary = {
            total_forecasts: currentForecasts.length,
            total_predicted_spending: 0,
            categories: [],
            alerts: {
                critical: 0,
                high: 0,
                total_unacknowledged: 0
            },
            accuracy: {
                overall: 0,
                by_category: {}
            }
        };
        
        for (const forecast of currentForecasts) {
            summary.total_predicted_spending += forecast.aggregate_forecast.total_predicted || 0;
            
            summary.categories.push({
                category: forecast.category || 'All Categories',
                predicted: forecast.aggregate_forecast.total_predicted,
                trend: forecast.aggregate_forecast.trend,
                accuracy: forecast.forecast_accuracy
            });
            
            // Count alerts
            forecast.alerts.forEach(alert => {
                if (!alert.acknowledged) {
                    summary.alerts.total_unacknowledged++;
                    if (alert.severity === 'critical') summary.alerts.critical++;
                    if (alert.severity === 'high') summary.alerts.high++;
                }
            });
            
            // Track accuracy
            if (forecast.forecast_accuracy) {
                summary.accuracy.overall += forecast.forecast_accuracy;
                if (forecast.category) {
                    summary.accuracy.by_category[forecast.category] = forecast.forecast_accuracy;
                }
            }
        }
        
        if (currentForecasts.length > 0) {
            summary.accuracy.overall /= currentForecasts.length;
        }
        
        return summary;
    }
    
    /**
     * PRIVATE METHODS - Forecasting Algorithms
     */
    
    _calculatePeriods(periodType) {
        const now = new Date();
        const periods = {};
        
        switch (periodType) {
            case 'weekly':
                periods.forecastStart = new Date(now);
                periods.forecastEnd = new Date(now.setDate(now.getDate() + 7));
                periods.historicalStart = new Date(now.setDate(now.getDate() - 90));
                periods.historicalEnd = new Date();
                break;
            case 'quarterly':
                periods.forecastStart = new Date(now);
                periods.forecastEnd = new Date(now.setMonth(now.getMonth() + 3));
                periods.historicalStart = new Date(now.setFullYear(now.getFullYear() - 2));
                periods.historicalEnd = new Date();
                break;
            case 'yearly':
                periods.forecastStart = new Date(now);
                periods.forecastEnd = new Date(now.setFullYear(now.getFullYear() + 1));
                periods.historicalStart = new Date(now.setFullYear(now.getFullYear() - 3));
                periods.historicalEnd = new Date();
                break;
            case 'monthly':
            default:
                periods.forecastStart = new Date(now);
                periods.forecastEnd = new Date(now.setMonth(now.getMonth() + 1));
                periods.historicalStart = new Date(now.setMonth(now.getMonth() - 12));
                periods.historicalEnd = new Date();
        }
        
        return periods;
    }
    
    async _getHistoricalData(userId, category, startDate, endDate) {
        const query = {
            user: userId,
            date: { $gte: startDate, $lte: endDate }
        };
        
        if (category) {
            query.category = category;
        }
        
        const expenses = await Expense.find(query).sort({ date: 1 });
        
        // Group by month
        const monthlyData = {};
        
        expenses.forEach(expense => {
            const monthKey = `${expense.date.getFullYear()}-${expense.date.getMonth() + 1}`;
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {
                    date: new Date(expense.date.getFullYear(), expense.date.getMonth(), 1),
                    amount: 0
                };
            }
            monthlyData[monthKey].amount += expense.amount;
        });
        
        return Object.values(monthlyData).sort((a, b) => a.date - b.date);
    }
    
    _movingAverageForecast(historicalData, periods, confidenceLevel) {
        const windowSize = Math.min(3, historicalData.length);
        const predictions = [];
        
        // Calculate moving average
        const recentData = historicalData.slice(-windowSize);
        const average = recentData.reduce((sum, d) => sum + d.amount, 0) / windowSize;
        
        // Calculate standard deviation for confidence intervals
        const variance = recentData.reduce((sum, d) => 
            sum + Math.pow(d.amount - average, 2), 0) / windowSize;
        const stdDev = Math.sqrt(variance);
        
        // Generate predictions
        const currentDate = new Date(periods.forecastStart);
        while (currentDate < periods.forecastEnd) {
            predictions.push({
                date: new Date(currentDate),
                predicted_amount: average,
                confidence_lower: average - (1.96 * stdDev),
                confidence_upper: average + (1.96 * stdDev),
                confidence_level: confidenceLevel
            });
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        
        // Calculate RMSE and MAE
        const errors = recentData.map(d => d.amount - average);
        const rmse = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length);
        const mae = errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length;
        
        return {
            predictions,
            modelMetadata: {
                accuracy_score: Math.max(0, 100 - (mae / average * 100)),
                rmse,
                mae
            }
        };
    }
    
    _linearRegressionForecast(historicalData, periods, confidenceLevel) {
        const n = historicalData.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = historicalData.map(d => d.amount);
        
        // Calculate linear regression coefficients
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        // Calculate residuals for confidence interval
        const predictions = [];
        const residuals = y.map((yi, i) => yi - (slope * i + intercept));
        const residualStdDev = Math.sqrt(
            residuals.reduce((sum, r) => sum + r * r, 0) / (n - 2)
        );
        
        // Generate future predictions
        const monthsDiff = Math.ceil((periods.forecastEnd - periods.forecastStart) / (30 * 24 * 60 * 60 * 1000));
        const currentDate = new Date(periods.forecastStart);
        
        for (let i = 0; i < monthsDiff; i++) {
            const futureX = n + i;
            const predictedAmount = slope * futureX + intercept;
            
            predictions.push({
                date: new Date(currentDate),
                predicted_amount: Math.max(0, predictedAmount),
                confidence_lower: Math.max(0, predictedAmount - 1.96 * residualStdDev),
                confidence_upper: predictedAmount + 1.96 * residualStdDev,
                confidence_level: confidenceLevel
            });
            
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        
        // Calculate metrics
        const rmse = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / n);
        const mae = residuals.reduce((sum, r) => sum + Math.abs(r), 0) / n;
        const meanY = sumY / n;
        
        return {
            predictions,
            modelMetadata: {
                accuracy_score: Math.max(0, 100 - (mae / meanY * 100)),
                rmse,
                mae
            }
        };
    }
    
    _exponentialSmoothingForecast(historicalData, periods, confidenceLevel) {
        const alpha = 0.3; // Smoothing parameter
        const predictions = [];
        
        // Initialize with first value
        let smoothed = historicalData[0].amount;
        const smoothedValues = [smoothed];
        
        // Calculate smoothed values
        for (let i = 1; i < historicalData.length; i++) {
            smoothed = alpha * historicalData[i].amount + (1 - alpha) * smoothed;
            smoothedValues.push(smoothed);
        }
        
        // Calculate error variance
        const errors = historicalData.map((d, i) => d.amount - smoothedValues[i]);
        const variance = errors.reduce((sum, e) => sum + e * e, 0) / errors.length;
        const stdDev = Math.sqrt(variance);
        
        // Use last smoothed value for predictions
        const lastSmoothed = smoothedValues[smoothedValues.length - 1];
        
        // Generate future predictions
        const currentDate = new Date(periods.forecastStart);
        while (currentDate < periods.forecastEnd) {
            predictions.push({
                date: new Date(currentDate),
                predicted_amount: lastSmoothed,
                confidence_lower: Math.max(0, lastSmoothed - 1.96 * stdDev),
                confidence_upper: lastSmoothed + 1.96 * stdDev,
                confidence_level: confidenceLevel
            });
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        
        const rmse = Math.sqrt(variance);
        const mae = errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length;
        const meanY = historicalData.reduce((sum, d) => sum + d.amount, 0) / historicalData.length;
        
        return {
            predictions,
            modelMetadata: {
                accuracy_score: Math.max(0, 100 - (mae / meanY * 100)),
                rmse,
                mae
            }
        };
    }
    
    _calculateAggregateForecast(predictions, historicalData) {
        const totalPredicted = predictions.reduce((sum, p) => sum + p.predicted_amount, 0);
        const averageMonthly = totalPredicted / predictions.length;
        
        // Calculate historical average for comparison
        const historicalAvg = historicalData.reduce((sum, d) => sum + d.amount, 0) / historicalData.length;
        
        // Determine trend
        let trend = 'stable';
        let trendPercentage = ((averageMonthly - historicalAvg) / historicalAvg) * 100;
        
        if (trendPercentage > 10) {
            trend = 'increasing';
        } else if (trendPercentage < -10) {
            trend = 'decreasing';
        } else if (Math.abs(trendPercentage) < 5) {
            trend = 'stable';
        } else {
            trend = 'volatile';
        }
        
        return {
            total_predicted: totalPredicted,
            average_monthly: averageMonthly,
            trend,
            trend_percentage: trendPercentage
        };
    }
    
    _detectSeasonalFactors(historicalData) {
        const monthlyAverages = {};
        const monthlyCounts = {};
        
        historicalData.forEach(data => {
            const month = data.date.getMonth() + 1;
            if (!monthlyAverages[month]) {
                monthlyAverages[month] = 0;
                monthlyCounts[month] = 0;
            }
            monthlyAverages[month] += data.amount;
            monthlyCounts[month]++;
        });
        
        // Calculate average for each month
        const overallAverage = historicalData.reduce((sum, d) => sum + d.amount, 0) / historicalData.length;
        
        const seasonalFactors = [];
        for (let month = 1; month <= 12; month++) {
            if (monthlyAverages[month]) {
                const monthAverage = monthlyAverages[month] / monthlyCounts[month];
                const factor = monthAverage / overallAverage;
                
                // Identify significant seasonal events
                let event = null;
                if (factor > 1.2) {
                    event = 'High spending period';
                } else if (factor < 0.8) {
                    event = 'Low spending period';
                }
                
                seasonalFactors.push({ month, factor, event });
            }
        }
        
        return seasonalFactors;
    }
    
    async _compareForecastToBudget(userId, category, predictions, periodType) {
        const totalPredicted = predictions.reduce((sum, p) => sum + p.predicted_amount, 0);
        
        // Get current budget
        const budgetQuery = { user: userId, is_active: true };
        if (category) {
            budgetQuery.category = category;
        }
        
        const budget = await Budget.findOne(budgetQuery);
        
        if (!budget) {
            return {
                vs_budget: {
                    budget_amount: null,
                    forecast_vs_budget: null,
                    will_exceed: false
                }
            };
        }
        
        const budgetAmount = budget.amount;
        const forecastVsBudget = totalPredicted - budgetAmount;
        const willExceed = forecastVsBudget > 0;
        
        return {
            vs_budget: {
                budget_amount: budgetAmount,
                forecast_vs_budget: forecastVsBudget,
                will_exceed: willExceed
            }
        };
    }
    
    _generateRecommendations(predictions, comparison, aggregateForecast) {
        const recommendations = [];
        
        // Budget recommendations
        if (comparison.vs_budget && comparison.vs_budget.will_exceed) {
            const exceededBy = comparison.vs_budget.forecast_vs_budget;
            recommendations.push({
                recommendation_type: 'increase_budget',
                title: 'Budget Increase Recommended',
                description: `Forecast indicates spending will exceed budget by $${exceededBy.toFixed(2)}. Consider increasing budget or reducing spending.`,
                impact_amount: exceededBy,
                priority: 'high'
            });
        }
        
        // Trend recommendations
        if (aggregateForecast.trend === 'increasing' && aggregateForecast.trend_percentage > 15) {
            recommendations.push({
                recommendation_type: 'review_category',
                title: 'Rising Spending Trend Detected',
                description: `Spending is projected to increase by ${aggregateForecast.trend_percentage.toFixed(1)}%. Review expenses to identify cost-saving opportunities.`,
                impact_amount: null,
                priority: 'medium'
            });
        }
        
        if (aggregateForecast.trend === 'decreasing' && comparison.vs_budget && !comparison.vs_budget.will_exceed) {
            const savings = Math.abs(comparison.vs_budget.forecast_vs_budget);
            recommendations.push({
                recommendation_type: 'save_more',
                title: 'Savings Opportunity',
                description: `Spending is decreasing. Consider allocating $${savings.toFixed(2)} to savings or investments.`,
                impact_amount: savings,
                priority: 'low'
            });
        }
        
        return recommendations;
    }
    
    _generateAlerts(predictions, comparison, aggregateForecast) {
        const alerts = [];
        
        // Budget alert
        if (comparison.vs_budget && comparison.vs_budget.will_exceed) {
            alerts.push({
                alert_type: 'forecast_exceeds_budget',
                severity: 'high',
                message: `Your forecast indicates you will exceed your budget by $${comparison.vs_budget.forecast_vs_budget.toFixed(2)}`,
                triggered_at: new Date()
            });
        }
        
        // Trend alert
        if (aggregateForecast.trend === 'increasing' && aggregateForecast.trend_percentage > 20) {
            alerts.push({
                alert_type: 'unusual_spike',
                severity: 'medium',
                message: `Spending is projected to increase significantly by ${aggregateForecast.trend_percentage.toFixed(1)}%`,
                triggered_at: new Date()
            });
        }
        
        return alerts;
    }
    
    async _getActualSpending(userId, category, date) {
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        const query = {
            user: userId,
            date: { $gte: startOfMonth, $lte: endOfMonth }
        };
        
        if (category) {
            query.category = category;
        }
        
        const expenses = await Expense.find(query);
        
        if (expenses.length === 0) return null;
        
        return expenses.reduce((sum, e) => sum + e.amount, 0);
    }
}

module.exports = new BudgetForecastingService();
