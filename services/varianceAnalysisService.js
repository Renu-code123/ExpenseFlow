const BudgetVariance = require('../models/BudgetVariance');
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const Expense = require('../models/Expense');

class VarianceAnalysisService {
    /**
     * Run comprehensive variance analysis for a budget
     */
    async analyzeVariance(userId, budgetId, period) {
        const budget = await Budget.findOne({ _id: budgetId, userId });

        if (!budget) {
            throw new Error('Budget not found');
        }

        const { startDate, endDate } = period;

        // Get actual spending for the period
        const actualSpending = await this.getActualSpending(userId, startDate, endDate, budget);

        // Calculate variances for each category
        const varianceItems = await this.calculateCategoryVariances(budget, actualSpending);

        // Detect anomalies
        const itemsWithAnomalies = await this.detectAnomalies(varianceItems, userId);

        // Generate alerts
        const alerts = this.generateAlerts(itemsWithAnomalies, budget);

        // Calculate trends
        const trends = await this.calculateTrends(userId, budgetId, actualSpending);

        // Create variance record
        const variance = new BudgetVariance({
            userId,
            budgetId,
            budgetName: budget.name,
            analysisDate: new Date(),
            period: {
                startDate,
                endDate,
                periodType: this.determinePeriodType(startDate, endDate)
            },
            items: itemsWithAnomalies,
            alerts,
            trends
        });

        await variance.save();

        return variance;
    }

    /**
     * Get actual spending for period
     */
    async getActualSpending(userId, startDate, endDate, budget) {
        const spending = {};

        // Get transactions
        const transactions = await Transaction.find({
            userId,
            date: { $gte: startDate, $lte: endDate },
            type: 'expense'
        });

        // Get expenses
        const expenses = await Expense.find({
            userId,
            date: { $gte: startDate, $lte: endDate }
        });

        // Aggregate by category
        for (const txn of transactions) {
            const category = txn.category || 'Uncategorized';
            spending[category] = (spending[category] || 0) + Math.abs(txn.amount);
        }

        for (const exp of expenses) {
            const category = exp.category || 'Uncategorized';
            spending[category] = (spending[category] || 0) + Math.abs(exp.amount);
        }

        return spending;
    }

    /**
     * Calculate variances for each category
     */
    async calculateCategoryVariances(budget, actualSpending) {
        const items = [];

        // Process budget categories
        if (budget.categories && budget.categories.length > 0) {
            for (const budgetCat of budget.categories) {
                const category = budgetCat.category;
                const budgetedAmount = budgetCat.limit || 0;
                const actualAmount = actualSpending[category] || 0;
                const variance = actualAmount - budgetedAmount;
                const variancePercentage = budgetedAmount > 0 ? (variance / budgetedAmount) * 100 : 0;

                items.push({
                    category,
                    subcategory: budgetCat.subcategory,
                    budgetedAmount,
                    actualAmount,
                    variance,
                    variancePercentage,
                    varianceType: this.determineVarianceType(variance, budgetedAmount),
                    transactionCount: await this.getTransactionCount(category)
                });
            }
        } else {
            // If no categories, use overall budget
            const totalActual = Object.values(actualSpending).reduce((sum, amt) => sum + amt, 0);
            const budgetedAmount = budget.amount || 0;
            const variance = totalActual - budgetedAmount;
            const variancePercentage = budgetedAmount > 0 ? (variance / budgetedAmount) * 100 : 0;

            items.push({
                category: 'Overall',
                budgetedAmount,
                actualAmount: totalActual,
                variance,
                variancePercentage,
                varianceType: this.determineVarianceType(variance, budgetedAmount),
                transactionCount: 0
            });
        }

        return items;
    }

    /**
     * Detect anomalies in variance items
     */
    async detectAnomalies(items, userId) {
        const itemsWithScores = [];

        for (const item of items) {
            const anomalyScore = await this.calculateAnomalyScore(item, userId);
            const isAnomaly = anomalyScore > 70; // Threshold for anomaly

            itemsWithScores.push({
                ...item,
                anomalyScore,
                isAnomaly
            });
        }

        return itemsWithScores;
    }

    /**
     * Calculate anomaly score for an item
     */
    async calculateAnomalyScore(item, userId) {
        let score = 0;

        // Factor 1: Variance percentage (0-40 points)
        const absVariancePercent = Math.abs(item.variancePercentage);
        if (absVariancePercent > 100) {
            score += 40;
        } else if (absVariancePercent > 50) {
            score += 30;
        } else if (absVariancePercent > 25) {
            score += 20;
        } else if (absVariancePercent > 10) {
            score += 10;
        }

        // Factor 2: Unfavorable variance (0-30 points)
        if (item.varianceType === 'unfavorable') {
            if (item.variance > item.budgetedAmount * 0.5) {
                score += 30;
            } else if (item.variance > item.budgetedAmount * 0.25) {
                score += 20;
            } else {
                score += 10;
            }
        }

        // Factor 3: Historical comparison (0-30 points)
        const historicalScore = await this.getHistoricalAnomalyScore(item, userId);
        score += historicalScore;

        return Math.min(score, 100);
    }

    /**
     * Get historical anomaly score
     */
    async getHistoricalAnomalyScore(item, userId) {
        // Get historical variances for this category
        const historicalVariances = await BudgetVariance.find({
            userId,
            'items.category': item.category
        }).sort({ analysisDate: -1 }).limit(6);

        if (historicalVariances.length < 3) {
            return 0; // Not enough data
        }

        // Calculate average historical variance percentage
        const historicalPercentages = historicalVariances
            .map(v => v.items.find(i => i.category === item.category))
            .filter(i => i)
            .map(i => i.variancePercentage);

        const avgHistorical = historicalPercentages.reduce((a, b) => a + b, 0) / historicalPercentages.length;
        const stdDev = this.calculateStdDev(historicalPercentages);

        // Calculate Z-score
        const zScore = stdDev > 0 ? Math.abs((item.variancePercentage - avgHistorical) / stdDev) : 0;

        // Convert Z-score to points (0-30)
        if (zScore > 3) return 30;
        if (zScore > 2) return 20;
        if (zScore > 1) return 10;
        return 0;
    }

    /**
     * Calculate standard deviation
     */
    calculateStdDev(values) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(value => Math.pow(value - avg, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
        return Math.sqrt(avgSquareDiff);
    }

    /**
     * Generate alerts based on variance analysis
     */
    generateAlerts(items, budget) {
        const alerts = [];

        for (const item of items) {
            // Critical overrun alert
            if (item.variancePercentage > 100) {
                alerts.push({
                    severity: 'critical',
                    category: item.category,
                    message: `${item.category} has exceeded budget by ${item.variancePercentage.toFixed(1)}%`,
                    recommendedAction: 'Immediate review required. Consider reallocating funds or adjusting spending.'
                });
            }
            // High variance alert
            else if (item.variancePercentage > 50) {
                alerts.push({
                    severity: 'high',
                    category: item.category,
                    message: `${item.category} is ${item.variancePercentage.toFixed(1)}% over budget`,
                    recommendedAction: 'Review spending patterns and implement cost controls.'
                });
            }
            // Warning alert
            else if (item.variancePercentage > 25) {
                alerts.push({
                    severity: 'medium',
                    category: item.category,
                    message: `${item.category} is trending ${item.variancePercentage.toFixed(1)}% over budget`,
                    recommendedAction: 'Monitor closely and consider preventive measures.'
                });
            }

            // Anomaly alert
            if (item.isAnomaly) {
                alerts.push({
                    severity: item.anomalyScore > 85 ? 'high' : 'medium',
                    category: item.category,
                    message: `Unusual spending pattern detected in ${item.category} (Anomaly Score: ${item.anomalyScore.toFixed(0)})`,
                    recommendedAction: 'Investigate recent transactions for irregularities.'
                });
            }
        }

        return alerts;
    }

    /**
     * Calculate spending trends
     */
    async calculateTrends(userId, budgetId, currentSpending) {
        // Get previous period's spending
        const previousVariances = await BudgetVariance.find({
            userId,
            budgetId
        }).sort({ analysisDate: -1 }).limit(3);

        if (previousVariances.length < 2) {
            return {
                isIncreasing: false,
                trendPercentage: 0,
                projectedOverrun: 0,
                daysUntilOverrun: 0
            };
        }

        const currentTotal = Object.values(currentSpending).reduce((sum, amt) => sum + amt, 0);
        const previousTotal = previousVariances[0].summary.totalActual;

        const trendPercentage = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;
        const isIncreasing = trendPercentage > 5;

        return {
            isIncreasing,
            trendPercentage,
            projectedOverrun: 0, // Calculated separately
            daysUntilOverrun: 0
        };
    }

    /**
     * Determine variance type
     */
    determineVarianceType(variance, budgetedAmount) {
        if (Math.abs(variance) < budgetedAmount * 0.05) {
            return 'neutral';
        }
        return variance > 0 ? 'unfavorable' : 'favorable';
    }

    /**
     * Determine period type
     */
    determinePeriodType(startDate, endDate) {
        const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

        if (days <= 1) return 'daily';
        if (days <= 7) return 'weekly';
        if (days <= 31) return 'monthly';
        if (days <= 92) return 'quarterly';
        return 'yearly';
    }

    /**
     * Get transaction count for category
     */
    async getTransactionCount(category) {
        // Simplified - would query actual transactions
        return 0;
    }

    /**
     * Get variance dashboard
     */
    async getVarianceDashboard(userId) {
        // Get latest variances
        const latestVariances = await BudgetVariance.find({ userId })
            .sort({ analysisDate: -1 })
            .limit(10);

        // Get critical alerts
        const criticalAlerts = latestVariances
            .flatMap(v => v.alerts)
            .filter(a => a.severity === 'critical' || a.severity === 'high')
            .slice(0, 10);

        // Calculate summary statistics
        const totalBudgets = await Budget.countDocuments({ userId });
        const budgetsOverBudget = latestVariances.filter(v => v.status === 'exceeded' || v.status === 'critical').length;
        const totalAnomalies = latestVariances.reduce((sum, v) => sum + v.summary.anomaliesDetected, 0);

        return {
            summary: {
                totalBudgets,
                budgetsOverBudget,
                totalAnomalies,
                criticalAlerts: criticalAlerts.length
            },
            latestVariances,
            criticalAlerts
        };
    }

    /**
     * Get variance trend over time
     */
    async getVarianceTrend(userId, budgetId, months = 6) {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        const variances = await BudgetVariance.find({
            userId,
            budgetId,
            analysisDate: { $gte: startDate }
        }).sort({ analysisDate: 1 });

        return variances.map(v => ({
            date: v.analysisDate,
            utilizationRate: v.summary.utilizationRate,
            variancePercentage: v.summary.variancePercentage,
            status: v.status,
            anomalies: v.summary.anomaliesDetected
        }));
    }
}

module.exports = new VarianceAnalysisService();
