const expenseRepository = require('../repositories/expenseRepository');
const budgetRepository = require('../repositories/budgetRepository');
const multiTierCache = require('../utils/multiTierCache');
const invalidationManager = require('../services/invalidationManager');
const Workspace = require('../models/Workspace');
const mongoose = require('mongoose');

const CACHE_KEYS = {
    SPENDING_TRENDS: 'spending_trends',
    CATEGORY_BREAKDOWN: 'category_breakdown',
    MONTHLY_COMPARISON: 'monthly_comparison',
    INSIGHTS: 'insights',
    PREDICTIONS: 'predictions'
};

const CACHE_TTL = {
    SHORT: 5,       // 5 minutes
    MEDIUM: 15,     // 15 minutes
    LONG: 60,       // 1 hour
    XLONG: 1440     // 1 day
};

class AnalyticsService {
    constructor() {
        this.defaultCurrency = process.env.DEFAULT_CURRENCY || 'INR';
        this.defaultLocale = process.env.DEFAULT_LOCALE || 'en-US';
        // Z-Score configuration
        this.Z_SCORE_THRESHOLD = 2.0;
        this.MINIMUM_DATA_POINTS = 5;
    }

    async _getScopedKey(type, userId, params, workspaceId = null) {
        let epoch = 0;
        if (workspaceId) {
            const ws = await Workspace.findById(workspaceId).select('cacheEpoch');
            epoch = ws ? ws.cacheEpoch : 0;
        }
        const paramStr = JSON.stringify(params);
        const key = `analytics:${type}:${userId}:${workspaceId || 'global'}:v${epoch}:${paramStr}`;

        // Track dependency for invalidation
        if (workspaceId) {
            invalidationManager.track(`workspace:${workspaceId}`, key);
        }

        return key;
    }

    formatCurrency(amount, locale = this.defaultLocale, currency = this.defaultCurrency) {
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(Number(amount) || 0);
        } catch (err) {
            return `${currency} ${Number(amount || 0).toFixed(2)}`;
        }
    }

    /**
     * Calculate Z-Score for anomaly detection
     */
    calculateZScore(value, mean, stdDev) {
        if (stdDev === 0) return 0;
        return (value - mean) / stdDev;
    }

    /**
     * Calculate standard deviation
     */
    calculateStandardDeviation(values) {
        if (values.length < 2) return 0;
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
        return Math.sqrt(avgSquaredDiff);
    }

    /**
     * Get Z-Score based anomaly detection for spending
     */
    async getZScoreAnomalies(userId, options = {}) {
        const {
            months = 6,
            threshold = this.Z_SCORE_THRESHOLD,
            useCache = true,
            workspaceId = null
        } = options;

        const cacheParams = { months, threshold };
        const cacheKey = await this._getScopedKey('zscore_anomalies', userId, cacheParams, workspaceId);

        if (useCache) {
            const cached = await multiTierCache.get(cacheKey);
            if (cached) return cached;
        }

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        // Get all expenses grouped by category and date
        const expenses = await expenseRepository.findAll({
            user: userId,
            type: 'expense',
            date: { $gte: startDate }
        }, { sort: { date: 1 } });

        // Group by category
        const categoryData = {};
        expenses.forEach(expense => {
            if (!categoryData[Transaction.category]) {
                categoryData[Transaction.category] = [];
            }
            categoryData[Transaction.category].push({
                id: Transaction._id,
                amount: Transaction.amount,
                date: Transaction.date,
                description: Transaction.description
            });
        });

        const anomalies = [];
        const categoryStats = {};

        // Calculate statistics and detect anomalies per category
        for (const [category, transactions] of Object.entries(categoryData)) {
            const amounts = transactions.map(t => t.amount);

            if (amounts.length < this.MINIMUM_DATA_POINTS) {
                categoryStats[category] = {
                    mean: amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0,
                    stdDev: 0,
                    count: amounts.length,
                    insufficientData: true
                };
                continue;
            }

            const mean = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
            const stdDev = this.calculateStandardDeviation(amounts);
            const volatility = stdDev / (mean || 1) * 100;

            categoryStats[category] = {
                mean: Math.round(mean * 100) / 100,
                stdDev: Math.round(stdDev * 100) / 100,
                count: amounts.length,
                volatility: Math.round(volatility * 10) / 10,
                min: Math.min(...amounts),
                max: Math.max(...amounts)
            };

            // Detect anomalies
            transactions.forEach(transaction => {
                const zScore = this.calculateZScore(transaction.amount, mean, stdDev);

                if (Math.abs(zScore) >= threshold) {
                    anomalies.push({
                        transactionId: transaction.id,
                        category,
                        amount: transaction.amount,
                        date: transaction.date,
                        description: transaction.description,
                        zScore: Math.round(zScore * 100) / 100,
                        deviation: Math.round((transaction.amount - mean) * 100) / 100,
                        deviationPercent: Math.round(((transaction.amount - mean) / mean) * 100),
                        severity: Math.abs(zScore) >= 3 ? 'critical' : Math.abs(zScore) >= 2.5 ? 'high' : 'medium',
                        direction: zScore > 0 ? 'overspend' : 'underspend'
                    });
                }
            });
        }

        // Sort anomalies by severity and date
        anomalies.sort((a, b) => {
            const severityOrder = { critical: 1, high: 2, medium: 3 };
            if (severityOrder[a.severity] !== severityOrder[b.severity]) {
                return severityOrder[a.severity] - severityOrder[b.severity];
            }
            return new Date(b.date) - new Date(a.date);
        });

        const result = {
            anomalies,
            categoryStats,
            summary: {
                totalTransactions: expenses.length,
                totalAnomalies: anomalies.length,
                anomalyRate: expenses.length > 0
                    ? Math.round((anomalies.length / expenses.length) * 1000) / 10
                    : 0,
                criticalCount: anomalies.filter(a => a.severity === 'critical').length,
                highCount: anomalies.filter(a => a.severity === 'high').length,
                mediumCount: anomalies.filter(a => a.severity === 'medium').length,
                mostVolatileCategory: Object.entries(categoryStats)
                    .filter(([_, stats]) => !stats.insufficientData)
                    .sort((a, b) => (b[1].volatility || 0) - (a[1].volatility || 0))[0]?.[0] || null
            },
            analysisConfig: {
                months,
                threshold,
                minDataPoints: this.MINIMUM_DATA_POINTS
            },
            generatedAt: new Date()
        };

        if (useCache) {
            await multiTierCache.set(cacheKey, result, 30 * 60000); // 30 mins
        }

        return result;
    }

    /**
     * Get spending volatility analysis
     */
    async getVolatilityAnalysis(userId, options = {}) {
        const { months = 6, useCache = true } = options;

        if (useCache) {
            const cached = await AnalyticsCache.getCache('volatility_analysis', userId, { months });
            if (cached) return cached;
        }

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        // Get monthly spending by category
        const monthlyData = await expenseRepository.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    type: 'expense',
                    date: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        category: '$category',
                        year: { $year: '$date' },
                        month: { $month: '$date' }
                    },
                    total: { $sum: '$amount' },
                    count: { $sum: 1 },
                    avgTransaction: { $avg: '$amount' }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Group by category and calculate volatility
        const categoryVolatility = {};
        const categoryMonthly = {};

        monthlyData.forEach(item => {
            const { category } = item._id;
            if (!categoryMonthly[category]) {
                categoryMonthly[category] = [];
            }
            categoryMonthly[category].push({
                period: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
                total: item.total,
                count: item.count,
                avg: item.avgTransaction
            });
        });

        for (const [category, monthlyAmounts] of Object.entries(categoryMonthly)) {
            const totals = monthlyAmounts.map(m => m.total);
            const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
            const stdDev = this.calculateStandardDeviation(totals);
            const cv = mean > 0 ? (stdDev / mean) * 100 : 0; // Coefficient of variation

            // Calculate trend
            let trend = 'stable';
            if (totals.length >= 3) {
                const recentAvg = totals.slice(-2).reduce((a, b) => a + b, 0) / 2;
                const olderAvg = totals.slice(0, -2).reduce((a, b) => a + b, 0) / Math.max(1, totals.length - 2);
                const change = ((recentAvg - olderAvg) / olderAvg) * 100;
                if (change > 10) trend = 'increasing';
                else if (change < -10) trend = 'decreasing';
            }

            categoryVolatility[category] = {
                monthlyData: monthlyAmounts,
                statistics: {
                    mean: Math.round(mean * 100) / 100,
                    stdDev: Math.round(stdDev * 100) / 100,
                    volatilityIndex: Math.round(cv * 10) / 10,
                    min: Math.min(...totals),
                    max: Math.max(...totals),
                    range: Math.max(...totals) - Math.min(...totals)
                },
                trend,
                periodsCovered: monthlyAmounts.length,
                riskLevel: cv > 50 ? 'high' : cv > 25 ? 'medium' : 'low'
            };
        }

        // Overall portfolio volatility
        const allMonthlyTotals = Object.values(categoryMonthly).flat();
        const monthlyTotals = {};
        allMonthlyTotals.forEach(item => {
            if (!monthlyTotals[item.period]) monthlyTotals[item.period] = 0;
            monthlyTotals[item.period] += item.total;
        });

        const totalValues = Object.values(monthlyTotals);
        const overallMean = totalValues.reduce((a, b) => a + b, 0) / totalValues.length;
        const overallStdDev = this.calculateStandardDeviation(totalValues);
        const overallCV = overallMean > 0 ? (overallStdDev / overallMean) * 100 : 0;

        const result = {
            categoryVolatility,
            overall: {
                mean: Math.round(overallMean * 100) / 100,
                stdDev: Math.round(overallStdDev * 100) / 100,
                volatilityIndex: Math.round(overallCV * 10) / 10,
                riskLevel: overallCV > 40 ? 'high' : overallCV > 20 ? 'medium' : 'low',
                periodsCovered: totalValues.length
            },
            rankings: Object.entries(categoryVolatility)
                .map(([cat, data]) => ({
                    category: cat,
                    volatility: data.statistics.volatilityIndex,
                    trend: data.trend,
                    riskLevel: data.riskLevel
                }))
                .sort((a, b) => b.volatility - a.volatility),
            generatedAt: new Date()
        };

        if (useCache) {
            await AnalyticsCache.setCache('volatility_analysis', userId, { months }, result, 60);
        }

        return result;
    }
    /**
     * Get spending trends over time (daily, weekly, monthly)
     */
    async getSpendingTrends(userId, options = {}) {
        const {
            period = 'monthly', // daily, weekly, monthly
            months = 6,
            useCache = true
        } = options;

        // Check cache
        if (useCache) {
            const cached = await AnalyticsCache.getCache(CACHE_KEYS.SPENDING_TRENDS
                , userId, { period, months });
            if (cached) return cached;
        }

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);
        startDate.setHours(0, 0, 0, 0);

        let groupFormat;
        switch (period) {
            case 'daily':
                groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$date' } };
                break;
            case 'weekly':
                groupFormat = {
                    $concat: [
                        { $toString: { $year: '$date' } },
                        '-W',
                        { $toString: { $week: '$date' } }
                    ]
                };
                break;
            case 'monthly':
            default:
                groupFormat = { $dateToString: { format: '%Y-%m', date: '$date' } };
        }

        const trends = await expenseRepository.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    date: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        period: groupFormat,
                        type: '$type'
                    },
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.period',
                    income: {
                        $sum: { $cond: [{ $eq: ['$_id.type', 'income'] }, '$total', 0] }
                    },
                    expense: {
                        $sum: { $cond: [{ $eq: ['$_id.type', 'expense'] }, '$total', 0] }
                    },
                    incomeCount: {
                        $sum: { $cond: [{ $eq: ['$_id.type', 'income'] }, '$count', 0] }
                    },
                    expenseCount: {
                        $sum: { $cond: [{ $eq: ['$_id.type', 'expense'] }, '$count', 0] }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Calculate moving averages and growth rates
        const result = {
            period,
            data: trends.map((item, index, arr) => {
                const prevItem = arr[index - 1];
                const expenseGrowth = prevItem
                    ? ((item.expense - prevItem.expense) / (prevItem.expense || 1)) * 100
                    : 0;
                const incomeGrowth = prevItem
                    ? ((item.income - prevItem.income) / (prevItem.income || 1)) * 100
                    : 0;

                return {
                    period: item._id,
                    income: Math.round(item.income * 100) / 100,
                    expense: Math.round(item.expense * 100) / 100,
                    net: Math.round((item.income - item.expense) * 100) / 100,
                    savingsRate: item.income > 0
                        ? Math.round(((item.income - item.expense) / item.income) * 100)
                        : 0,
                    transactionCount: item.incomeCount + item.expenseCount,
                    expenseGrowth: Math.round(expenseGrowth * 10) / 10,
                    incomeGrowth: Math.round(incomeGrowth * 10) / 10
                };
            }),
            summary: this.calculateTrendsSummary(trends)
        };

        // Cache result
        if (useCache) {
            await AnalyticsCache.setCache(CACHE_KEYS.SPENDING_TRENDS
                , userId, { period, months }, result, CACHE_TTL.MEDIUM);
        }

        return result;
    }

    /**
     * Calculate trends summary
     */
    calculateTrendsSummary(trends) {
        if (trends.length === 0) return null;

        const totalIncome = trends.reduce((sum, t) => sum + t.income, 0);
        const totalExpense = trends.reduce((sum, t) => sum + t.expense, 0);
        const avgIncome = totalIncome / trends.length;
        const avgExpense = totalExpense / trends.length;

        // Calculate trend direction
        const recentTrends = trends.slice(-3);
        const olderTrends = trends.slice(0, 3);
        const recentAvgExpense = recentTrends.reduce((sum, t) => sum + t.expense, 0) / recentTrends.length;
        const olderAvgExpense = olderTrends.reduce((sum, t) => sum + t.expense, 0) / olderTrends.length;
        const trendDirection = recentAvgExpense > olderAvgExpense ? 'increasing' : 'decreasing';

        return {
            totalIncome: Math.round(totalIncome * 100) / 100,
            totalExpense: Math.round(totalExpense * 100) / 100,
            netSavings: Math.round((totalIncome - totalExpense) * 100) / 100,
            avgMonthlyIncome: Math.round(avgIncome * 100) / 100,
            avgMonthlyExpense: Math.round(avgExpense * 100) / 100,
            avgSavingsRate: totalIncome > 0
                ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100)
                : 0,
            spendingTrend: trendDirection,
            periodsCovered: trends.length
        };
    }

    /**
     * Get category-wise breakdown
     */
    async getCategoryBreakdown(userId, options = {}) {
        const {
            startDate,
            endDate,
            type = 'expense',
            useCache = true
        } = options;

        const cacheParams = {
            startDate: startDate?.toString(),
            endDate: endDate?.toString(),
            type
        };

        if (useCache) {
            const cached = await AnalyticsCache.getCache(CACHE_KEYS.CATEGORY_BREAKDOWN, userId, cacheParams);
            if (cached) return cached;
        }

        const matchQuery = {
            user: new mongoose.Types.ObjectId(userId),
            type
        };

        if (startDate) matchQuery.date = { $gte: new Date(startDate) };
        if (endDate) {
            matchQuery.date = matchQuery.date || {};
            matchQuery.date.$lte = new Date(endDate);
        }

        const breakdown = await expenseRepository.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 },
                    avgAmount: { $avg: '$amount' },
                    maxAmount: { $max: '$amount' },
                    minAmount: { $min: '$amount' }
                }
            },
            { $sort: { total: -1 } }
        ]);

        const grandTotal = breakdown.reduce((sum, cat) => sum + cat.total, 0);

        const result = {
            type,
            grandTotal: Math.round(grandTotal * 100) / 100,
            categories: breakdown.map(cat => ({
                category: cat._id,
                total: Math.round(cat.total * 100) / 100,
                percentage: Math.round((cat.total / grandTotal) * 1000) / 10,
                count: cat.count,
                avgAmount: Math.round(cat.avgAmount * 100) / 100,
                maxAmount: Math.round(cat.maxAmount * 100) / 100,
                minAmount: Math.round(cat.minAmount * 100) / 100
            })),
            topCategory: breakdown.length > 0 ? breakdown[0]._id : null
        };

        if (useCache) {
            await AnalyticsCache.setCache(CACHE_KEYS.CATEGORY_BREAKDOWN, userId, cacheParams, result, CACHE_TTL.SHORT);
        }

        return result;
    }

    /**
     * Get month-over-month comparison
     */
    async getMonthlyComparison(userId, options = {}) {
        const { months = 3, useCache = true } = options;

        if (useCache) {
            const cached = await AnalyticsCache.getCache(CACHE_KEYS.MONTHLY_COMPARISON, userId, { months });
            if (cached) return cached;
        }

        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);

        // Optimize: Use a single aggregation to get all monthly stats instead of multiple queries in a loop
        const allStats = await expenseRepository.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    date: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$date" },
                        month: { $month: "$date" },
                        type: "$type"
                    },
                    total: { $sum: "$amount" },
                    count: { $sum: 1 }
                }
            }
        ]);

        for (let i = 0; i < months; i++) {
            const { start: monthStart, end: monthEnd } = this.getMonthRange(i);
            const { start: prevMonthStart, end: prevMonthEnd } = this.getMonthRange(i + 1);

            const currentMonth = getMonthData(d.getFullYear(), d.getMonth());
            const previousMonth = getMonthData(pd.getFullYear(), pd.getMonth());

            const expenseChange = previousMonth.totalExpense > 0
                ? ((currentMonth.totalExpense - previousMonth.totalExpense) / previousMonth.totalExpense) * 100
                : 0;

            const incomeChange = previousMonth.totalIncome > 0
                ? ((currentMonth.totalIncome - previousMonth.totalIncome) / previousMonth.totalIncome) * 100
                : 0;

            comparisons.push({
                month: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
                monthKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
                current: currentMonth,
                previous: previousMonth,
                changes: {
                    expense: Math.round(expenseChange * 10) / 10,
                    income: Math.round(incomeChange * 10) / 10,
                    expenseAmount: Math.round((currentMonth.totalExpense - previousMonth.totalExpense) * 100) / 100,
                    incomeAmount: Math.round((currentMonth.totalIncome - previousMonth.totalIncome) * 100) / 100
                }
            });
        }

        const result = { comparisons };

        if (useCache) {
            await AnalyticsCache.setCache(CACHE_KEYS.MONTHLY_COMPARISON, userId, { months }, result, CACHE_TTL.MEDIUM);
        }

        return result;
    }

    /**
     * Get stats for a specific month
     */
    async getMonthStats(userId, startDate, endDate) {
        const stats = await expenseRepository.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$type',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const income = stats.find(s => s._id === 'income');
        const expense = stats.find(s => s._id === 'expense');

        return {
            totalIncome: income?.total || 0,
            totalExpense: expense?.total || 0,
            incomeCount: income?.count || 0,
            expenseCount: expense?.count || 0,
            net: (income?.total || 0) - (expense?.total || 0),
            savingsRate: income?.total
                ? Math.round((((income?.total || 0) - (expense?.total || 0)) / income.total) * 100)
                : 0
        };
    }

    /**
     * Generate smart financial insights
     */
    async getInsights(userId, options = {}) {
        const { useCache = true } = options;

        if (useCache) {
            const cached = await AnalyticsCache.getCache(CACHE_KEYS.INSIGHTS, userId, {});
            if (cached) return cached;
        }

        const insights = [];
        const now = new Date();

        // Get last 3 months of data using aggregation for better performance
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

        const [aggregateData] = await expenseRepository.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    date: { $gte: threeMonthsAgo }
                }
            },
            {
                $facet: {
                    byCategory: [
                        { $match: { type: 'expense' } },
                        { $group: { _id: '$category', total: { $sum: '$amount' } } }
                    ],
                    byMonth: [
                        {
                            $group: {
                                _id: {
                                    year: { $year: '$date' },
                                    month: { $month: '$date' },
                                    type: '$type'
                                },
                                total: { $sum: '$amount' }
                            }
                        }
                    ],
                    overall: [
                        { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } }
                    ]
                }
            }
        ]);

        const totalExpense = aggregateData.overall.find(o => o._id === 'expense')?.total || 0;
        const totalIncome = aggregateData.overall.find(o => o._id === 'income')?.total || 0;
        const expenseCount = aggregateData.overall.find(o => o._id === 'expense')?.count || 0;

        if (expenseCount === 0 && totalIncome === 0) {
            return { insights: [{ type: 'info', message: 'Start adding expenses to get personalized insights!', priority: 1 }] };
        }

        // Analyze spending patterns
        const categoryTotals = {};
        aggregateData.byCategory.forEach(c => {
            categoryTotals[c._id] = c.total;
        });

        const monthlyExpenses = {};
        aggregateData.byMonth.forEach(m => {
            if (m._id.type === 'expense') {
                const monthKey = `${m._id.year}-${m._id.month - 1}`;
                monthlyExpenses[monthKey] = m.total;
            }
        });

        // Insight 1: Top spending category
        const topCategory = Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1])[0];

        if (topCategory) {
            const percentage = ((topCategory[1] / totalExpense) * 100).toFixed(1);
            insights.push({
                type: 'category',
                priority: 2,
                title: 'Top Spending Category',
                message: `${this.capitalizeFirst(topCategory[0])} accounts for ${percentage}% of your expenses (${this.formatCurrency(topCategory[1])})`,
                category: topCategory[0],
                amount: topCategory[1],
                suggestion: percentage > 40
                    ? 'Consider diversifying your spending or setting a budget for this category.'
                    : null
            });
        }

        // Insight 2: Savings rate
        if (totalIncome > 0) {
            const savingsRate = ((totalIncome - totalExpense) / totalIncome) * 100;
            let savingsInsight = {
                type: 'savings',
                priority: 1,
                title: 'Savings Rate',
                value: Math.round(savingsRate),
                income: totalIncome,
                expense: totalExpense
            };

            if (savingsRate < 0) {
                savingsInsight.message = `You're spending more than you earn! Consider reducing expenses.`;
                savingsInsight.status = 'critical';
            } else if (savingsRate < 10) {
                savingsInsight.message = `Your savings rate is ${savingsRate.toFixed(1)}%. Aim for at least 20%.`;
                savingsInsight.status = 'warning';
            } else if (savingsRate < 20) {
                savingsInsight.message = `Good start! Your savings rate is ${savingsRate.toFixed(1)}%. Keep improving!`;
                savingsInsight.status = 'moderate';
            } else {
                savingsInsight.message = `Excellent! You're saving ${savingsRate.toFixed(1)}% of your income.`;
                savingsInsight.status = 'good';
            }

            insights.push(savingsInsight);
        }

        // Insight 3: Spending trend
        const monthKeys = Object.keys(monthlyExpenses).sort();
        if (monthKeys.length >= 2) {
            const lastMonth = monthlyExpenses[monthKeys[monthKeys.length - 1]] || 0;
            const prevMonth = monthlyExpenses[monthKeys[monthKeys.length - 2]] || 0;

            if (prevMonth > 0) {
                const change = ((lastMonth - prevMonth) / prevMonth) * 100;
                insights.push({
                    type: 'trend',
                    priority: 2,
                    title: 'Spending Trend',
                    message: change > 0
                        ? `Your spending increased by ${change.toFixed(1)}% compared to last month.`
                        : `Great! Your spending decreased by ${Math.abs(change).toFixed(1)}% compared to last month.`,
                    changePercent: Math.round(change * 10) / 10,
                    status: change > 20 ? 'warning' : change > 0 ? 'moderate' : 'good'
                });
            }
        }

        // Insight 4: Unusual expenses - fetch separately with limit to avoid fetching everything
        const avgExpense = totalExpense / expenseCount;
        const unusualExpenses = await expenseRepository.findAll({
            user: userId,
            type: 'expense',
            date: { $gte: threeMonthsAgo },
            amount: { $gt: avgExpense * 3 }
        }, {
            sort: { amount: -1 },
            limit: 3
        });

        if (unusualExpenses.length > 0) {
            insights.push({
                type: 'anomaly',
                priority: 3,
                title: 'Unusual Expenses Detected',
                message: `Found ${unusualExpenses.length} expense(s) significantly above your average.`,
                expenses: unusualExpenses.map(e => ({
                    description: e.description,
                    amount: e.amount,
                    category: e.category,
                    date: e.date
                }))
            });
        }

        // Sort by priority
        insights.sort((a, b) => a.priority - b.priority);

        const result = {
            insights,
            generatedAt: new Date(),
            periodAnalyzed: '3 months'
        };

        if (useCache) {
            await AnalyticsCache.setCache(CACHE_KEYS.INSIGHTS, userId, {}, result, CACHE_TTL.LONG);
        }

        return result;
    }

    /**
     * Get spending predictions based on historical data
     */
    async getSpendingPredictions(userId, options = {}) {
        const { useCache = true } = options;

        if (useCache) {
            const cached = await AnalyticsCache.getCache(CACHE_KEYS.PREDICTIONS, userId, {});
            if (cached) return cached;
        }

        // Get last 6 months of data for prediction
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyData = await expenseRepository.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    date: { $gte: sixMonthsAgo },
                    type: 'expense'
                }
            },
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
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        if (monthlyData.length < 2) {
            return {
                message: 'Need at least 2 months of data for predictions',
                predictions: null
            };
        }

        // Calculate moving average for prediction
        const amounts = monthlyData.map(m => m.total);
        const movingAvg = this.calculateMovingAverage(amounts, 3);

        // Simple linear regression for trend
        const trend = this.calculateTrend(amounts);

        // Predict next month
        const lastAmount = amounts[amounts.length - 1];
        const predictedAmount = Math.max(0, lastAmount + trend);

        // Confidence based on variance
        const variance = this.calculateVariance(amounts);
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const confidence = Math.max(0, Math.min(100, 100 - (Math.sqrt(variance) / avgAmount) * 100));

        const result = {
            nextMonthPrediction: Math.round(predictedAmount * 100) / 100,
            confidence: Math.round(confidence),
            trend: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
            trendAmount: Math.round(trend * 100) / 100,
            historicalAverage: Math.round(avgAmount * 100) / 100,
            movingAverage: Math.round(movingAvg * 100) / 100,
            basedOnMonths: monthlyData.length,
            categoryPredictions: await this.predictCategorySpending(userId, sixMonthsAgo)
        };

        if (useCache) {
            await AnalyticsCache.setCache(CACHE_KEYS.PREDICTIONS, userId, {}, result, CACHE_TTL.XLONG);
        }

        return result;
    }

    /**
     * Predict spending by category
     */
    async predictCategorySpending(userId, startDate) {
        const categoryData = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    date: { $gte: startDate },
                    type: 'expense'
                }
            },
            {
                $group: {
                    _id: '$category',
                    avgMonthly: { $avg: '$amount' },
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const months = Math.ceil((new Date() - startDate) / (CACHE_TTL.SHORT * 24 * CACHE_TTL.MEDIUM * CACHE_TTL.MEDIUM * 1000));

        return categoryData.map(cat => ({
            category: cat._id,
            predictedMonthly: Math.round((cat.total / months) * 100) / 100,
            avgTransaction: Math.round(cat.avgMonthly * 100) / 100
        }));
    }

    /**
     * Get spending velocity (rate of spending)
     */
    async getSpendingVelocity(userId, options = {}) {
        const { useCache = true } = options;

        if (useCache) {
            const cached = await AnalyticsCache.getCache('velocity', userId, {});
            if (cached) return cached;
        }

        const now = new Date();
        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const currentMonthExpenses = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    date: { $gte: monthStart },
                    type: 'expense'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const spent = currentMonthExpenses[0]?.total || 0;
        const dailyRate = spent / dayOfMonth;
        const projectedMonthEnd = dailyRate * daysInMonth;

        const result = {
            currentSpent: Math.round(spent * 100) / 100,
            dailyAverage: Math.round(dailyRate * 100) / 100,
            projectedMonthEnd: Math.round(projectedMonthEnd * 100) / 100,
            dayOfMonth,
            daysRemaining: daysInMonth - dayOfMonth,
            transactionCount: currentMonthExpenses[0]?.count || 0,
            generatedAt: now
        };

        if (useCache) {
            await AnalyticsCache.setCache('velocity', userId, {}, result, 15);
        }

        return result;
    }

    /**
     * Helper: Calculate moving average
     */
    calculateMovingAverage(data, period) {
        if (data.length < period) return data[data.length - 1] || 0;
        const slice = data.slice(-period);
        return slice.reduce((a, b) => a + b, 0) / period;
    }

    /**
     * Helper: Calculate trend using linear regression
     */
    calculateTrend(data) {
        if (data.length < 2) return 0;

        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += data[i];
            sumXY += i * data[i];
            sumXX += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return slope || 0;
    }

    /**
     * Helper: Calculate variance
     */
    calculateVariance(data) {
        if (data.length < 2) return 0;
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        return data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    }

    /**
     * Helper: Capitalize first letter
     */
    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Get probabilistic liquidity insights using the Forecasting Engine
     * Issue #678: Predictive risk analysis for dashboard integration
     */
    async getLiquidityInsights(userId) {
        const forecastingEngine = require('./forecastingEngine');
        const forecast = await forecastingEngine.runSimulation(userId); // Run baseline

        const { summary } = forecast;
        const insights = [];

        if (summary.riskOfInsolvencyPct > 10) {
            insights.push({
                type: 'critical',
                title: 'Liquidity Risk Alert',
                message: `Based on your spending velocity, there is a ${summary.riskOfInsolvencyPct.toFixed(1)}% probability of reaching a zero balance in the next 90 days.`,
                impact: 'High'
            });
        }

        if (summary.medianFinalBalance < summary.startBalance) {
            insights.push({
                type: 'warning',
                title: 'Negative Cash Flow Trend',
                message: 'Your probabilistic 90-day trajectory shows a net decline in total liquidity.',
                impact: 'Medium'
            });
        }

        return {
            forecastSummary: summary,
            insights,
            generatedAt: new Date()
        };
    }

    /**
     * Invalidate user analytics cache
     */
    async invalidateCache(userId) {
        await AnalyticsCache.invalidateUserCache(userId);
    }
}

module.exports = new AnalyticsService();
