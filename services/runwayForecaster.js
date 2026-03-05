const Transaction = require('../models/Transaction');
const TreasuryVault = require('../models/TreasuryVault');
const FinancialModels = require('../utils/financialModels');

class RunwayForecaster {
    /**
     * Advanced cash runway forecasting using multiple methodologies
     */
    async generateForecast(userId, forecastDays = 180) {
        // Get historical transaction data
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const historicalTransactions = await Transaction.find({
            user: userId,
            date: { $gte: sixMonthsAgo }
        }).sort({ date: 1 });

        // Get current liquidity
        const vaults = await TreasuryVault.find({ userId, isActive: true });
        const currentLiquidity = vaults.reduce((sum, v) => sum + v.availableLiquidity, 0);

        // Generate forecasts using different methods
        const simpleForecast = this.simpleLinearForecast(historicalTransactions, currentLiquidity, forecastDays);
        const movingAvgForecast = this.movingAverageForecast(historicalTransactions, currentLiquidity, forecastDays);
        const seasonalForecast = this.seasonalForecast(historicalTransactions, currentLiquidity, forecastDays);
        const mlLikeForecast = this.mlLikeForecast(historicalTransactions, currentLiquidity, forecastDays);

        // Ensemble forecast (weighted average)
        const ensembleForecast = this.createEnsemble([
            { forecast: simpleForecast, weight: 0.2 },
            { forecast: movingAvgForecast, weight: 0.3 },
            { forecast: seasonalForecast, weight: 0.25 },
            { forecast: mlLikeForecast, weight: 0.25 }
        ], forecastDays);

        return {
            currentLiquidity,
            forecastHorizon: forecastDays,
            forecasts: {
                simple: simpleForecast,
                movingAverage: movingAvgForecast,
                seasonal: seasonalForecast,
                mlLike: mlLikeForecast,
                ensemble: ensembleForecast
            },
            insights: this.generateInsights(ensembleForecast, currentLiquidity),
            confidence: this.calculateConfidence(historicalTransactions)
        };
    }

    /**
     * Simple linear trend forecast
     */
    simpleLinearForecast(transactions, startingBalance, days) {
        const expenses = transactions.filter(t => t.type === 'expense');
        const income = transactions.filter(t => t.type === 'income');

        const avgDailyExpense = expenses.reduce((sum, t) => sum + t.amount, 0) /
            Math.max(1, this.getDaysBetween(transactions));
        const avgDailyIncome = income.reduce((sum, t) => sum + t.amount, 0) /
            Math.max(1, this.getDaysBetween(transactions));

        const netDailyFlow = avgDailyIncome - avgDailyExpense;

        const forecast = [];
        for (let i = 0; i <= days; i++) {
            const projectedBalance = startingBalance + (netDailyFlow * i);
            forecast.push({
                day: i,
                balance: Math.max(0, projectedBalance),
                netFlow: netDailyFlow
            });
        }

        return forecast;
    }

    /**
     * Moving average forecast with trend adjustment
     */
    movingAverageForecast(transactions, startingBalance, days) {
        const windowSize = 30; // 30-day moving average
        const expenses = transactions.filter(t => t.type === 'expense');

        // Group by day
        const dailyExpenses = this.groupByDay(expenses);
        const movingAvgs = this.calculateMovingAverage(dailyExpenses, windowSize);

        const avgExpense = movingAvgs.length > 0 ?
            movingAvgs[movingAvgs.length - 1] :
            expenses.reduce((sum, t) => sum + t.amount, 0) / Math.max(1, this.getDaysBetween(transactions));

        // Calculate trend
        const trend = this.calculateTrend(movingAvgs);

        const forecast = [];
        for (let i = 0; i <= days; i++) {
            const adjustedExpense = avgExpense * (1 + trend * i / 100);
            const projectedBalance = startingBalance - (adjustedExpense * i);
            forecast.push({
                day: i,
                balance: Math.max(0, projectedBalance),
                dailyExpense: adjustedExpense
            });
        }

        return forecast;
    }

    /**
     * Seasonal forecast accounting for monthly patterns
     */
    seasonalForecast(transactions, startingBalance, days) {
        // Calculate monthly patterns
        const monthlyPatterns = this.calculateMonthlyPatterns(transactions);

        const forecast = [];
        let currentBalance = startingBalance;

        for (let i = 0; i <= days; i++) {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + i);
            const month = futureDate.getMonth();

            const monthlyFactor = monthlyPatterns[month] || 1.0;
            const baseExpense = this.getAverageDailyExpense(transactions);
            const adjustedExpense = baseExpense * monthlyFactor;

            currentBalance -= adjustedExpense;

            forecast.push({
                day: i,
                balance: Math.max(0, currentBalance),
                seasonalFactor: monthlyFactor,
                dailyExpense: adjustedExpense
            });
        }

        return forecast;
    }

    /**
     * ML-like forecast using exponential smoothing
     */
    mlLikeForecast(transactions, startingBalance, days) {
        const alpha = 0.3; // Smoothing factor
        const beta = 0.1;  // Trend smoothing factor

        const expenses = transactions.filter(t => t.type === 'expense');
        const dailyExpenses = this.groupByDay(expenses);

        if (dailyExpenses.length === 0) {
            return this.simpleLinearForecast(transactions, startingBalance, days);
        }

        // Initialize
        let level = dailyExpenses[0];
        let trend = dailyExpenses.length > 1 ? dailyExpenses[1] - dailyExpenses[0] : 0;

        // Apply Holt's linear trend method
        for (let i = 1; i < dailyExpenses.length; i++) {
            const prevLevel = level;
            level = alpha * dailyExpenses[i] + (1 - alpha) * (level + trend);
            trend = beta * (level - prevLevel) + (1 - beta) * trend;
        }

        const forecast = [];
        let currentBalance = startingBalance;

        for (let i = 0; i <= days; i++) {
            const forecastExpense = level + trend * i;
            currentBalance -= forecastExpense;

            forecast.push({
                day: i,
                balance: Math.max(0, currentBalance),
                forecastExpense,
                level,
                trend
            });
        }

        return forecast;
    }

    /**
     * Create ensemble forecast from multiple models
     */
    createEnsemble(forecasts, days) {
        const ensemble = [];

        for (let i = 0; i <= days; i++) {
            let weightedBalance = 0;
            let totalWeight = 0;

            forecasts.forEach(({ forecast, weight }) => {
                if (forecast[i]) {
                    weightedBalance += forecast[i].balance * weight;
                    totalWeight += weight;
                }
            });

            ensemble.push({
                day: i,
                balance: totalWeight > 0 ? weightedBalance / totalWeight : 0,
                confidence: this.calculateDayConfidence(i, days)
            });
        }

        return ensemble;
    }

    /**
     * Generate actionable insights from forecast
     */
    generateInsights(forecast, currentLiquidity) {
        const insights = [];

        // Find when balance hits zero
        const zeroDay = forecast.findIndex(f => f.balance === 0);
        if (zeroDay > 0 && zeroDay < forecast.length) {
            insights.push({
                type: 'critical',
                message: `Cash runway depleted in ${zeroDay} days`,
                severity: zeroDay < 30 ? 'emergency' : zeroDay < 60 ? 'high' : 'medium',
                actionRequired: true
            });
        }

        // Check for declining trend
        const midPoint = Math.floor(forecast.length / 2);
        const earlyAvg = forecast.slice(0, 30).reduce((sum, f) => sum + f.balance, 0) / 30;
        const lateAvg = forecast.slice(midPoint, midPoint + 30).reduce((sum, f) => sum + f.balance, 0) / 30;

        if (lateAvg < earlyAvg * 0.5) {
            insights.push({
                type: 'warning',
                message: 'Significant liquidity decline projected',
                severity: 'medium',
                recommendation: 'Consider cost optimization or revenue acceleration'
            });
        }

        // Positive insights
        if (forecast[forecast.length - 1].balance > currentLiquidity * 1.2) {
            insights.push({
                type: 'positive',
                message: 'Liquidity growth projected',
                severity: 'low',
                recommendation: 'Consider investment opportunities'
            });
        }

        return insights;
    }

    /**
     * Calculate forecast confidence based on data quality
     */
    calculateConfidence(transactions) {
        const dataPoints = transactions.length;
        const timeSpan = this.getDaysBetween(transactions);

        // More data points and longer timespan = higher confidence
        let confidence = 50; // Base confidence

        if (dataPoints > 100) confidence += 20;
        else if (dataPoints > 50) confidence += 10;

        if (timeSpan > 120) confidence += 20;
        else if (timeSpan > 60) confidence += 10;

        // Check for consistency
        const variance = this.calculateVariance(transactions);
        if (variance < 0.3) confidence += 10; // Low variance = more predictable

        return Math.min(100, confidence);
    }

    /**
     * Helper: Calculate confidence for specific forecast day
     */
    calculateDayConfidence(day, totalDays) {
        // Confidence decreases with forecast horizon
        return Math.max(20, 100 - (day / totalDays) * 60);
    }

    /**
     * Helper: Group transactions by day
     */
    groupByDay(transactions) {
        const grouped = {};
        transactions.forEach(t => {
            const day = new Date(t.date).toISOString().split('T')[0];
            grouped[day] = (grouped[day] || 0) + t.amount;
        });
        return Object.values(grouped);
    }

    /**
     * Helper: Calculate moving average
     */
    calculateMovingAverage(data, windowSize) {
        const result = [];
        for (let i = windowSize - 1; i < data.length; i++) {
            const window = data.slice(i - windowSize + 1, i + 1);
            const avg = window.reduce((sum, val) => sum + val, 0) / windowSize;
            result.push(avg);
        }
        return result;
    }

    /**
     * Helper: Calculate trend from data
     */
    calculateTrend(data) {
        if (data.length < 2) return 0;
        const recent = data.slice(-10);
        const older = data.slice(-20, -10);

        const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
        const olderAvg = older.reduce((sum, val) => sum + val, 0) / (older.length || 1);

        return ((recentAvg - olderAvg) / olderAvg) * 100;
    }

    /**
     * Helper: Calculate monthly spending patterns
     */
    calculateMonthlyPatterns(transactions) {
        const monthlyTotals = Array(12).fill(0);
        const monthlyCounts = Array(12).fill(0);

        transactions.filter(t => t.type === 'expense').forEach(t => {
            const month = new Date(t.date).getMonth();
            monthlyTotals[month] += t.amount;
            monthlyCounts[month]++;
        });

        const avgExpense = monthlyTotals.reduce((sum, val) => sum + val, 0) /
            Math.max(1, monthlyCounts.reduce((sum, val) => sum + val, 0));

        return monthlyTotals.map((total, i) => {
            const monthAvg = monthlyCounts[i] > 0 ? total / monthlyCounts[i] : avgExpense;
            return monthAvg / avgExpense;
        });
    }

    /**
     * Helper: Get average daily expense
     */
    getAverageDailyExpense(transactions) {
        const expenses = transactions.filter(t => t.type === 'expense');
        const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0);
        const days = this.getDaysBetween(transactions);
        return totalExpense / Math.max(1, days);
    }

    /**
     * Helper: Get days between first and last transaction
     */
    getDaysBetween(transactions) {
        if (transactions.length < 2) return 1;
        const dates = transactions.map(t => new Date(t.date).getTime());
        const minDate = Math.min(...dates);
        const maxDate = Math.max(...dates);
        return Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) || 1;
    }

    /**
     * Helper: Calculate variance in spending
     */
    calculateVariance(transactions) {
        const expenses = transactions.filter(t => t.type === 'expense');
        if (expenses.length === 0) return 0;

        const amounts = expenses.map(t => t.amount);
        const mean = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
        const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;

        return Math.sqrt(variance) / mean; // Coefficient of variation
    }
}

module.exports = new RunwayForecaster();
