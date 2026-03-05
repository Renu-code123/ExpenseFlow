const SpendForecast = require('../models/SpendForecast');
const Transaction = require('../models/Transaction');
const Expense = require('../models/Expense');
const Budget = require('../models/Budget');

class SpendForecaster {
    /**
     * Generate spend forecast for a budget/category
     */
    async generateForecast(userId, options = {}) {
        const {
            budgetId,
            category,
            forecastDays = 30,
            method = 'ensemble',
            historicalDays = 90
        } = options;

        const forecastId = `FC-${Date.now()}`;

        // Get historical data
        const historicalData = await this.getHistoricalData(userId, {
            budgetId,
            category,
            days: historicalDays
        });

        if (historicalData.length < 7) {
            throw new Error('Insufficient historical data for forecasting (minimum 7 days required)');
        }

        // Generate forecast using selected method
        let dataPoints;

        switch (method) {
            case 'linear':
                dataPoints = this.linearForecast(historicalData, forecastDays);
                break;
            case 'exponential':
                dataPoints = this.exponentialForecast(historicalData, forecastDays);
                break;
            case 'seasonal':
                dataPoints = this.seasonalForecast(historicalData, forecastDays);
                break;
            case 'moving_average':
                dataPoints = this.movingAverageForecast(historicalData, forecastDays);
                break;
            case 'ensemble':
            default:
                dataPoints = this.ensembleForecast(historicalData, forecastDays);
                break;
        }

        // Add confidence intervals
        const dataPointsWithCI = this.addConfidenceIntervals(dataPoints, historicalData);

        // Detect budget overrun alerts
        const alerts = await this.detectBudgetAlerts(userId, budgetId, category, dataPointsWithCI);

        // Create forecast record
        const forecast = new SpendForecast({
            userId,
            budgetId,
            category,
            forecastId,
            forecastDate: new Date(),
            forecastPeriod: {
                startDate: new Date(),
                endDate: new Date(Date.now() + forecastDays * 24 * 60 * 60 * 1000),
                periodType: forecastDays <= 7 ? 'daily' : forecastDays <= 31 ? 'weekly' : 'monthly'
            },
            historicalPeriod: {
                startDate: new Date(Date.now() - historicalDays * 24 * 60 * 60 * 1000),
                endDate: new Date(),
                dataPoints: historicalData.length
            },
            forecastMethod: method,
            dataPoints: dataPointsWithCI,
            alerts
        });

        await forecast.save();

        return forecast;
    }

    /**
     * Get historical spending data
     */
    async getHistoricalData(userId, options) {
        const { budgetId, category, days } = options;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const endDate = new Date();

        const query = {
            userId,
            date: { $gte: startDate, $lte: endDate }
        };

        if (category) {
            query.category = category;
        }

        // Get transactions
        const transactions = await Transaction.find({
            ...query,
            type: 'expense'
        }).sort({ date: 1 });

        // Get expenses
        const expenses = await Expense.find(query).sort({ date: 1 });

        // Aggregate by day
        const dailySpending = {};

        for (const txn of transactions) {
            const dateKey = txn.date.toISOString().split('T')[0];
            dailySpending[dateKey] = (dailySpending[dateKey] || 0) + Math.abs(txn.amount);
        }

        for (const exp of expenses) {
            const dateKey = exp.date.toISOString().split('T')[0];
            dailySpending[dateKey] = (dailySpending[dateKey] || 0) + Math.abs(exp.amount);
        }

        // Convert to array
        const data = [];
        for (let i = 0; i < days; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const dateKey = date.toISOString().split('T')[0];

            data.push({
                date,
                amount: dailySpending[dateKey] || 0
            });
        }

        return data;
    }

    /**
     * Linear regression forecast
     */
    linearForecast(historicalData, forecastDays) {
        const n = historicalData.length;
        const x = historicalData.map((_, i) => i);
        const y = historicalData.map(d => d.amount);

        // Calculate linear regression coefficients
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Generate forecast
        const forecast = [];
        for (let i = 0; i < forecastDays; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);

            const predictedAmount = Math.max(0, slope * (n + i) + intercept);

            forecast.push({
                date,
                predictedAmount
            });
        }

        return forecast;
    }

    /**
     * Exponential smoothing forecast
     */
    exponentialForecast(historicalData, forecastDays) {
        const alpha = 0.3; // Smoothing factor
        let smoothed = historicalData[0].amount;

        // Calculate smoothed values
        for (let i = 1; i < historicalData.length; i++) {
            smoothed = alpha * historicalData[i].amount + (1 - alpha) * smoothed;
        }

        // Generate forecast
        const forecast = [];
        for (let i = 0; i < forecastDays; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);

            forecast.push({
                date,
                predictedAmount: Math.max(0, smoothed)
            });
        }

        return forecast;
    }

    /**
     * Seasonal decomposition forecast
     */
    seasonalForecast(historicalData, forecastDays) {
        const seasonalPeriod = 7; // Weekly seasonality

        // Calculate seasonal indices
        const seasonalIndices = new Array(seasonalPeriod).fill(0);
        const counts = new Array(seasonalPeriod).fill(0);

        for (let i = 0; i < historicalData.length; i++) {
            const dayOfWeek = i % seasonalPeriod;
            seasonalIndices[dayOfWeek] += historicalData[i].amount;
            counts[dayOfWeek]++;
        }

        // Average seasonal indices
        for (let i = 0; i < seasonalPeriod; i++) {
            seasonalIndices[i] = counts[i] > 0 ? seasonalIndices[i] / counts[i] : 0;
        }

        // Calculate trend
        const avgAmount = historicalData.reduce((sum, d) => sum + d.amount, 0) / historicalData.length;

        // Generate forecast
        const forecast = [];
        for (let i = 0; i < forecastDays; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const dayOfWeek = i % seasonalPeriod;

            const predictedAmount = Math.max(0, seasonalIndices[dayOfWeek]);

            forecast.push({
                date,
                predictedAmount
            });
        }

        return forecast;
    }

    /**
     * Moving average forecast
     */
    movingAverageForecast(historicalData, forecastDays) {
        const windowSize = Math.min(7, historicalData.length);

        // Calculate moving average
        const recentData = historicalData.slice(-windowSize);
        const avgAmount = recentData.reduce((sum, d) => sum + d.amount, 0) / windowSize;

        // Generate forecast
        const forecast = [];
        for (let i = 0; i < forecastDays; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);

            forecast.push({
                date,
                predictedAmount: Math.max(0, avgAmount)
            });
        }

        return forecast;
    }

    /**
     * Ensemble forecast (combines multiple methods)
     */
    ensembleForecast(historicalData, forecastDays) {
        const linear = this.linearForecast(historicalData, forecastDays);
        const exponential = this.exponentialForecast(historicalData, forecastDays);
        const seasonal = this.seasonalForecast(historicalData, forecastDays);
        const movingAvg = this.movingAverageForecast(historicalData, forecastDays);

        // Weighted average of all methods
        const weights = {
            linear: 0.25,
            exponential: 0.25,
            seasonal: 0.3,
            movingAvg: 0.2
        };

        const forecast = [];
        for (let i = 0; i < forecastDays; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);

            const predictedAmount =
                linear[i].predictedAmount * weights.linear +
                exponential[i].predictedAmount * weights.exponential +
                seasonal[i].predictedAmount * weights.seasonal +
                movingAvg[i].predictedAmount * weights.movingAvg;

            forecast.push({
                date,
                predictedAmount: Math.max(0, predictedAmount)
            });
        }

        return forecast;
    }

    /**
     * Add confidence intervals to forecast
     */
    addConfidenceIntervals(dataPoints, historicalData) {
        // Calculate historical volatility
        const amounts = historicalData.map(d => d.amount);
        const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - mean, 2), 0) / amounts.length;
        const stdDev = Math.sqrt(variance);

        // Add confidence intervals (95% confidence)
        const zScore = 1.96; // 95% confidence

        return dataPoints.map(dp => ({
            ...dp,
            lowerBound: Math.max(0, dp.predictedAmount - zScore * stdDev),
            upperBound: dp.predictedAmount + zScore * stdDev,
            confidence: 95
        }));
    }

    /**
     * Detect budget overrun alerts
     */
    async detectBudgetAlerts(userId, budgetId, category, dataPoints) {
        const alerts = [];

        if (!budgetId) return alerts;

        const budget = await Budget.findOne({ _id: budgetId, userId });
        if (!budget) return alerts;

        let budgetLimit = budget.amount;

        // If category specified, get category limit
        if (category && budget.categories) {
            const budgetCat = budget.categories.find(c => c.category === category);
            if (budgetCat) {
                budgetLimit = budgetCat.limit;
            }
        }

        // Calculate cumulative spending
        let cumulative = 0;
        for (const dp of dataPoints) {
            cumulative += dp.predictedAmount;

            if (cumulative > budgetLimit) {
                alerts.push({
                    type: 'budget_overrun',
                    severity: 'high',
                    message: `Predicted to exceed budget by ${new Date(dp.date).toLocaleDateString()}`,
                    date: dp.date,
                    amount: cumulative - budgetLimit
                });
                break;
            }
        }

        // Detect unusual spikes
        const avgPredicted = dataPoints.reduce((sum, dp) => sum + dp.predictedAmount, 0) / dataPoints.length;
        for (const dp of dataPoints) {
            if (dp.predictedAmount > avgPredicted * 2) {
                alerts.push({
                    type: 'unusual_spike',
                    severity: 'medium',
                    message: `Unusual spending spike predicted on ${new Date(dp.date).toLocaleDateString()}`,
                    date: dp.date,
                    amount: dp.predictedAmount
                });
            }
        }

        return alerts;
    }

    /**
     * Calculate forecast accuracy
     */
    async calculateAccuracy(forecastId) {
        const forecast = await SpendForecast.findOne({ forecastId });
        if (!forecast) return null;

        // Get actual data for the forecast period
        const actualData = await this.getHistoricalData(forecast.userId, {
            budgetId: forecast.budgetId,
            category: forecast.category,
            days: forecast.dataPoints.length
        });

        // Calculate error metrics
        let mape = 0;
        let mae = 0;
        let mse = 0;
        let count = 0;

        for (let i = 0; i < Math.min(forecast.dataPoints.length, actualData.length); i++) {
            const predicted = forecast.dataPoints[i].predictedAmount;
            const actual = actualData[i].amount;

            if (actual > 0) {
                mape += Math.abs((actual - predicted) / actual);
            }
            mae += Math.abs(actual - predicted);
            mse += Math.pow(actual - predicted, 2);
            count++;
        }

        if (count > 0) {
            mape = (mape / count) * 100;
            mae = mae / count;
            const rmse = Math.sqrt(mse / count);

            forecast.accuracy = {
                mape,
                mae,
                rmse
            };

            await forecast.save();
        }

        return forecast.accuracy;
    }
}

module.exports = new SpendForecaster();
