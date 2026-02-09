const Expense = require('../models/Expense');
const FinancialInsight = require('../models/FinancialInsight');
const SpendingPattern = require('../models/SpendingPattern');
const Subscription = require('../models/Subscription');
const User = require('../models/User');

class InsightService {
    constructor() {
        // Configuration
        this.ANOMALY_THRESHOLD = 2.5; // Standard deviations
        this.PATTERN_MIN_OCCURRENCES = 3;
        this.CONFIDENCE_THRESHOLD = 0.7;
    }

    /**
     * Generate comprehensive financial insights for a user
     */
    async generateInsights(userId) {
        const insights = [];
        
        // Run all analysis in parallel
        const [
            anomalies,
            patterns,
            forecasts,
            healthScore,
            recommendations
        ] = await Promise.all([
            this.detectAnomalies(userId),
            this.analyzeSpendingPatterns(userId),
            this.generateForecasts(userId),
            this.calculateFinancialHealth(userId),
            this.generateRecommendations(userId)
        ]);
        
        insights.push(...anomalies, ...patterns, ...forecasts, healthScore, ...recommendations);
        
        // Save insights to database
        await FinancialInsight.insertMany(insights.filter(i => i));
        
        return insights;
    }

    /**
     * Detect spending anomalies using statistical methods
     */
    async detectAnomalies(userId) {
        const insights = [];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        // Get recent expenses by category
        const expenses = await Expense.find({
            user: userId,
            type: 'expense',
            date: { $gte: thirtyDaysAgo }
        });
        
        // Group by category
        const byCategory = {};
        expenses.forEach(exp => {
            if (!byCategory[exp.category]) byCategory[exp.category] = [];
            byCategory[exp.category].push(exp.amount);
        });
        
        // Detect anomalies in each category
        for (const [category, amounts] of Object.entries(byCategory)) {
            if (amounts.length < 3) continue;
            
            const stats = this.calculateStats(amounts);
            const recentExpenses = expenses.filter(e => e.category === category)
                .sort((a, b) => b.date - a.date)
                .slice(0, 5);
            
            for (const expense of recentExpenses) {
                const zScore = Math.abs((expense.amount - stats.mean) / stats.stdDev);
                
                if (zScore > this.ANOMALY_THRESHOLD) {
                    const severity = zScore > 3.5 ? 'critical' : zScore > 3 ? 'high' : 'medium';
                    const percentDiff = ((expense.amount - stats.mean) / stats.mean * 100).toFixed(0);
                    
                    insights.push({
                        user: userId,
                        type: 'anomaly',
                        severity,
                        title: `Unusual ${category} expense detected`,
                        description: `You spent ₹${expense.amount} on ${expense.description}, which is ${percentDiff}% ${expense.amount > stats.mean ? 'higher' : 'lower'} than your usual ${category} spending of ₹${stats.mean.toFixed(0)}.`,
                        category,
                        confidence: Math.min(zScore / 4, 1),
                        amount: expense.amount,
                        metadata: {
                            transaction_id: expense._id,
                            anomaly_score: zScore,
                            mean_amount: stats.mean,
                            std_deviation: stats.stdDev,
                            recommendations: [
                                'Review if this expense was necessary',
                                'Check for duplicate charges',
                                'Consider if this is a one-time or recurring issue'
                            ]
                        }
                    });
                }
            }
        }
        
        return insights;
    }

    /**
     * Analyze spending patterns and habits
     */
    async analyzeSpendingPatterns(userId) {
        const insights = [];
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        
        const expenses = await Expense.find({
            user: userId,
            type: 'expense',
            date: { $gte: ninetyDaysAgo }
        }).sort({ date: 1 });
        
        // Detect recurring merchants
        const merchantPatterns = {};
        expenses.forEach(exp => {
            const merchant = exp.description.toLowerCase();
            if (!merchantPatterns[merchant]) {
                merchantPatterns[merchant] = [];
            }
            merchantPatterns[merchant].push({ amount: exp.amount, date: exp.date, category: exp.category });
        });
        
        // Analyze each merchant pattern
        for (const [merchant, transactions] of Object.entries(merchantPatterns)) {
            if (transactions.length >= this.PATTERN_MIN_OCCURRENCES) {
                const amounts = transactions.map(t => t.amount);
                const stats = this.calculateStats(amounts);
                const daysBetween = this.calculateAverageDaysBetween(transactions.map(t => t.date));
                
                // Save pattern to database
                await SpendingPattern.findOneAndUpdate(
                    { user: userId, merchant, pattern_type: 'merchant' },
                    {
                        category: transactions[0].category,
                        frequency: this.categorizeFrequency(transactions.length, 90),
                        average_amount: stats.mean,
                        median_amount: stats.median,
                        min_amount: Math.min(...amounts),
                        max_amount: Math.max(...amounts),
                        transaction_count: transactions.length,
                        last_occurrence: transactions[transactions.length - 1].date,
                        trend: this.detectTrend(amounts),
                        confidence_score: Math.min(transactions.length / 10, 1),
                        anomaly_threshold: {
                            lower: stats.mean - 2 * stats.stdDev,
                            upper: stats.mean + 2 * stats.stdDev
                        }
                    },
                    { upsert: true, new: true }
                );
                
                // Create insight for strong patterns
                if (transactions.length >= 5) {
                    insights.push({
                        user: userId,
                        type: 'pattern',
                        severity: 'low',
                        title: `Regular spending at ${merchant}`,
                        description: `You spend an average of ₹${stats.mean.toFixed(0)} at ${merchant} about every ${daysBetween} days. Consider if this is necessary or if there are cheaper alternatives.`,
                        category: transactions[0].category,
                        confidence: Math.min(transactions.length / 10, 1),
                        amount: stats.mean,
                        metadata: {
                            pattern_type: 'merchant',
                            merchant,
                            frequency: transactions.length,
                            avg_days_between: daysBetween,
                            recommendations: [
                                'Check if you can get a subscription discount',
                                'Look for promotional offers',
                                'Compare with alternatives'
                            ]
                        }
                    });
                }
            }
        }
        
        return insights;
    }

    /**
     * Generate cash flow forecasts
     */
    async generateForecasts(userId) {
        const insights = [];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const [expenses, income] = await Promise.all([
            Expense.find({
                user: userId,
                type: 'expense',
                date: { $gte: thirtyDaysAgo }
            }),
            Expense.find({
                user: userId,
                type: 'income',
                date: { $gte: thirtyDaysAgo }
            })
        ]);
        
        const dailyExpenses = expenses.reduce((sum, e) => sum + e.amount, 0) / 30;
        const monthlyIncome = income.reduce((sum, i) => sum + i.amount, 0);
        
        // 7-day forecast
        const sevenDayForecast = dailyExpenses * 7;
        const thirtyDayForecast = dailyExpenses * 30;
        const monthlyBalance = monthlyIncome - thirtyDayForecast;
        
        insights.push({
            user: userId,
            type: 'forecast',
            severity: monthlyBalance < 0 ? 'high' : monthlyBalance < monthlyIncome * 0.2 ? 'medium' : 'low',
            title: 'Cash flow forecast',
            description: `Based on your spending patterns, you're expected to spend ₹${sevenDayForecast.toFixed(0)} in the next 7 days and ₹${thirtyDayForecast.toFixed(0)} in the next 30 days. Your projected monthly balance: ₹${monthlyBalance.toFixed(0)}.`,
            category: 'other',
            confidence: 0.75,
            amount: thirtyDayForecast,
            metadata: {
                forecast_period: '30_days',
                daily_avg: dailyExpenses,
                forecast_7_days: sevenDayForecast,
                forecast_30_days: thirtyDayForecast,
                monthly_income: monthlyIncome,
                projected_balance: monthlyBalance,
                recommendations: monthlyBalance < 0 ? [
                    'Reduce discretionary spending',
                    'Look for additional income sources',
                    'Review your subscriptions'
                ] : [
                    'Good financial health',
                    'Consider increasing savings',
                    'Invest surplus funds'
                ]
            }
        });
        
        return insights;
    }

    /**
     * Calculate financial health score (0-100)
     */
    async calculateFinancialHealth(userId) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const [expenses, income, subscriptions] = await Promise.all([
            Expense.find({ user: userId, type: 'expense', date: { $gte: thirtyDaysAgo } }),
            Expense.find({ user: userId, type: 'income', date: { $gte: thirtyDaysAgo } }),
            Subscription.find({ user: userId, status: 'active' })
        ]);
        
        const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
        const totalIncome = income.reduce((sum, i) => sum + i.amount, 0);
        const subscriptionCost = await Subscription.getTotalMonthlyCost(userId);
        
        // Calculate score components
        const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;
        const subscriptionRatio = totalIncome > 0 ? (subscriptionCost / totalIncome) * 100 : 0;
        const expenseVariance = this.calculateExpenseVariance(expenses);
        
        // Weighted score
        let score = 0;
        score += Math.min(savingsRate * 0.4, 40); // 40% weight
        score += Math.max(0, 30 - subscriptionRatio * 0.3); // 30% weight
        score += Math.max(0, 30 - expenseVariance * 0.3); // 30% weight
        
        score = Math.round(Math.max(0, Math.min(100, score)));
        
        const severity = score >= 70 ? 'low' : score >= 50 ? 'medium' : 'high';
        const rating = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Improvement';
        
        return {
            user: userId,
            type: 'health_score',
            severity,
            title: `Financial health: ${rating} (${score}/100)`,
            description: `Your financial health score is ${score}/100. ${savingsRate > 20 ? 'Great savings rate!' : 'Consider saving more.'} ${subscriptionRatio > 20 ? 'Your subscriptions are taking up a significant portion of your income.' : ''}`,
            confidence: 0.85,
            metadata: {
                score,
                rating,
                savings_rate: savingsRate.toFixed(1),
                subscription_ratio: subscriptionRatio.toFixed(1),
                expense_variance: expenseVariance.toFixed(1),
                breakdown: {
                    total_income: totalIncome,
                    total_expenses: totalExpenses,
                    subscription_cost: subscriptionCost,
                    net_savings: totalIncome - totalExpenses
                },
                recommendations: score < 60 ? [
                    'Review and cut unnecessary subscriptions',
                    'Create a budget and stick to it',
                    'Increase your income sources',
                    'Reduce impulse purchases'
                ] : [
                    'Maintain your good financial habits',
                    'Consider investing surplus funds',
                    'Build an emergency fund'
                ]
            }
        };
    }

    /**
     * Generate personalized savings recommendations
     */
    async generateRecommendations(userId) {
        const recommendations = [];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const expenses = await Expense.find({
            user: userId,
            type: 'expense',
            date: { $gte: thirtyDaysAgo }
        });
        
        // Category-wise spending analysis
        const categorySpending = {};
        expenses.forEach(exp => {
            categorySpending[exp.category] = (categorySpending[exp.category] || 0) + exp.amount;
        });
        
        // Identify high spending categories
        const sortedCategories = Object.entries(categorySpending)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        
        for (const [category, amount] of sortedCategories) {
            const savingsPotential = amount * 0.15; // Assume 15% savings potential
            
            const tips = {
                food: ['Cook at home more often', 'Use food delivery coupons', 'Pack lunch for work'],
                transport: ['Use public transportation', 'Carpool when possible', 'Consider monthly passes'],
                entertainment: ['Look for free events', 'Share streaming subscriptions', 'Use discount platforms'],
                shopping: ['Wait for sales', 'Use cashback apps', 'Avoid impulse buys'],
                utilities: ['Review your plans', 'Negotiate better rates', 'Reduce usage']
            };
            
            recommendations.push({
                user: userId,
                type: 'recommendation',
                severity: 'medium',
                title: `Save on ${category} expenses`,
                description: `You spent ₹${amount.toFixed(0)} on ${category} this month. You could potentially save ₹${savingsPotential.toFixed(0)} by optimizing these expenses.`,
                category,
                confidence: 0.7,
                savings_potential: savingsPotential,
                metadata: {
                    current_spending: amount,
                    recommendations: tips[category] || ['Review spending in this category', 'Look for alternatives']
                }
            });
        }
        
        return recommendations;
    }

    /**
     * Helper: Calculate statistical measures
     */
    calculateStats(values) {
        const sorted = values.slice().sort((a, b) => a - b);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const median = sorted[Math.floor(sorted.length / 2)];
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        
        return { mean, median, stdDev, variance };
    }

    /**
     * Helper: Calculate average days between dates
     */
    calculateAverageDaysBetween(dates) {
        if (dates.length < 2) return 0;
        
        const sorted = dates.sort((a, b) => a - b);
        const intervals = [];
        
        for (let i = 1; i < sorted.length; i++) {
            const days = (sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24);
            intervals.push(days);
        }
        
        return Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
    }

    /**
     * Helper: Categorize frequency
     */
    categorizeFrequency(count, days) {
        const perMonth = (count / days) * 30;
        if (perMonth >= 20) return 'very_frequent';
        if (perMonth >= 10) return 'frequent';
        if (perMonth >= 3) return 'occasional';
        return 'rare';
    }

    /**
     * Helper: Detect spending trend
     */
    detectTrend(amounts) {
        if (amounts.length < 3) return 'stable';
        
        const recent = amounts.slice(-5);
        const older = amounts.slice(0, Math.min(5, amounts.length - 5));
        
        if (older.length === 0) return 'stable';
        
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const change = ((recentAvg - olderAvg) / olderAvg) * 100;
        
        if (change > 15) return 'increasing';
        if (change < -15) return 'decreasing';
        
        const variance = this.calculateStats(amounts).stdDev / recentAvg;
        return variance > 0.5 ? 'volatile' : 'stable';
    }

    /**
     * Helper: Calculate expense variance
     */
    calculateExpenseVariance(expenses) {
        if (expenses.length === 0) return 0;
        
        const amounts = expenses.map(e => e.amount);
        const stats = this.calculateStats(amounts);
        return (stats.stdDev / stats.mean) * 100;
    }
}

module.exports = new InsightService();
