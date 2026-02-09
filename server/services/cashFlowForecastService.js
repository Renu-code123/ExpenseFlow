/**
 * Cash Flow Forecast Service
 * Issue #522: Intelligent Cash Flow Forecasting & Runway Analytics
 * 
 * Provides predictive balance projections, burn rate analysis,
 * and scenario simulations for financial planning.
 */

const mongoose = require('mongoose');
const ForecastSnapshot = require('../models/ForecastSnapshot');
const Account = require('../models/Account');
const Expense = require('../models/Expense');
const RecurringExpense = require('../models/RecurringExpense');
const recurringService = require('./recurringService');
const forecastingEngine = require('./forecastingEngine');

class CashFlowForecastService {
    /**
     * Generate a new forecast for the user
     * @param {String} userId 
     * @param {Object} options - { projectionDays, includeScenarios }
     */
    async generateForecast(userId, options = {}) {
        const projectionDays = options.projectionDays || 180; // 6 months default

        try {
            // 1. Get current balances from all active accounts
            const accounts = await Account.getUserAccounts(userId);
            const totalBalance = accounts.reduce((sum, acc) => {
                if (acc.type === 'credit_card' || acc.type === 'loan') {
                    return sum - Math.abs(acc.balance);
                }
                return sum + acc.balance;
            }, 0);

            // 2. Calculate historical burn rate
            const burnRateData = await this.calculateBurnRate(userId);

            // 3. Get recurring transactions
            const recurringData = await recurringService.getProjectionData(userId);

            // 4. Generate projection using the engine
            const dailyBurnRate = burnRateData.dailyNetBurn;
            const projectionDataPoints = forecastingEngine.generateProjection(
                totalBalance,
                dailyBurnRate,
                recurringData,
                projectionDays
            );

            // 5. Calculate runway
            const runwayDays = forecastingEngine.calculateRunway(projectionDataPoints);

            // 6. Calculate confidence score
            const confidenceScore = await this.calculateConfidenceScore(userId, burnRateData);

            // 7. Create forecast snapshot
            const snapshot = new ForecastSnapshot({
                user: userId,
                forecastDate: new Date(),
                startingBalance: totalBalance,
                projectionPeriodDays: projectionDays,
                predictedRunwayDays: runwayDays,
                burnRate: burnRateData.monthlyNetBurn,
                confidenceScore,
                dataPoints: projectionDataPoints.map(p => ({
                    date: p.date,
                    predictedBalance: p.balance,
                    lowerBound: p.balance * 0.85, // Simple ±15% confidence interval
                    upperBound: p.balance * 1.15,
                    type: 'predicted'
                })),
                scenarios: options.includeScenarios ? await this.generateScenarios(userId, projectionDataPoints) : [],
                metadata: {
                    activeRecurringCount: recurringData.length,
                    variableExpenseRatio: burnRateData.variableExpenseRatio,
                    modelUsed: 'weighted_moving_average'
                }
            });

            await snapshot.save();

            return snapshot;
        } catch (error) {
            console.error('[CashFlowForecastService] Error generating forecast:', error);
            throw error;
        }
    }

    /**
     * Calculate burn rate from historical data
     */
    async calculateBurnRate(userId) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6); // Last 6 months

        const expenses = await Expense.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$date' },
                        month: { $month: '$date' }
                    },
                    totalExpense: {
                        $sum: {
                            $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0]
                        }
                    },
                    totalIncome: {
                        $sum: {
                            $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0]
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        if (expenses.length === 0) {
            return {
                monthlyNetBurn: 0,
                dailyNetBurn: 0,
                monthlyGrossBurn: 0,
                variableExpenseRatio: 0.5
            };
        }

        // Calculate net flows (income - expenses)
        const monthlyNetFlows = expenses.map(e => e.totalIncome - e.totalExpense);
        const monthlyExpenses = expenses.map(e => e.totalExpense);

        // Use WMA for more accurate recent trends
        const monthlyNetBurn = forecastingEngine.calculateWMA(
            monthlyNetFlows.map(f => f < 0 ? Math.abs(f) : 0)
        );
        const monthlyGrossBurn = forecastingEngine.calculateWMA(monthlyExpenses);

        // For variable expense ratio, we need to determine what portion is NOT recurring
        const recurringStats = await recurringService.getStatistics(userId);
        const recurringMonthlyExpense = recurringStats.monthlyExpenseTotal || 0;
        const variableExpenseRatio = recurringMonthlyExpense > 0
            ? Math.min(1, (monthlyGrossBurn - recurringMonthlyExpense) / monthlyGrossBurn)
            : 0.7; // Default assumption

        return {
            monthlyNetBurn,
            dailyNetBurn: monthlyNetBurn / 30,
            monthlyGrossBurn,
            variableExpenseRatio: Math.max(0.3, variableExpenseRatio) // at least 30%
        };
    }

    /**
     * Calculate confidence score based on data consistency
     */
    async calculateConfidenceScore(userId, burnRateData) {
        // Factors:
        // 1. Amount of historical data
        // 2. Consistency of spending
        // 3. Number of recurring expenses
        // 4. Account sync status

        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6);

        const expenseCount = await Expense.countDocuments({
            user: userId,
            date: { $gte: startDate, $lte: endDate }
        });

        const recurringCount = await RecurringExpense.countDocuments({
            user: userId,
            isActive: true,
            isPaused: false
        });

        let score = 0;

        // Data volume score (max 40 points)
        if (expenseCount > 100) score += 40;
        else if (expenseCount > 50) score += 30;
        else if (expenseCount > 20) score += 20;
        else score += 10;

        // Recurring expenses score (max 30 points)
        if (recurringCount > 5) score += 30;
        else if (recurringCount > 2) score += 20;
        else if (recurringCount > 0) score += 10;

        // Consistency score (max 30 points)
        // If variable ratio is low, spending is predictable
        if (burnRateData.variableExpenseRatio < 0.3) score += 30;
        else if (burnRateData.variableExpenseRatio < 0.5) score += 20;
        else if (burnRateData.variableExpenseRatio < 0.7) score += 10;

        return Math.min(100, score);
    }

    /**
     * Generate common "What-if" scenarios
     */
    async generateScenarios(userId, baseProjection) {
        const scenarios = [];

        // Scenario 1: Major one-time purchase
        scenarios.push({
            name: 'Major Purchase',
            description: 'What if you make a $5,000 purchase next month?',
            adjustments: [{
                type: 'one_time',
                amount: 5000,
                startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                description: 'Large one-time expense'
            }],
            impactOnRunway: -15 // estimated days
        });

        // Scenario 2: Pay raise / new income
        scenarios.push({
            name: 'Income Increase',
            description: 'What if your monthly income increases by $1,000?',
            adjustments: [{
                type: 'recurring_add',
                amount: 1000,
                startDate: new Date(),
                description: 'Monthly income boost'
            }],
            impactOnRunway: 45 // estimated days
        });

        // Scenario 3: Cancel subscription
        const recurringStats = await recurringService.getStatistics(userId);
        if (recurringStats.monthlyExpenseTotal > 0) {
            scenarios.push({
                name: 'Cancel Subscriptions',
                description: `What if you cancel 50% of recurring expenses ($${(recurringStats.monthlyExpenseTotal * 0.5).toFixed(2)}/mo)?`,
                adjustments: [{
                    type: 'recurring_remove',
                    amount: recurringStats.monthlyExpenseTotal * 0.5,
                    startDate: new Date(),
                    description: 'Subscription reduction'
                }],
                impactOnRunway: 20 // estimated days
            });
        }

        return scenarios;
    }

    /**
     * Get latest forecast for user
     */
    async getLatestForecast(userId) {
        return await ForecastSnapshot.findOne({ user: userId })
            .sort({ createdAt: -1 })
            .lean();
    }

    /**
     * Get forecast history
     */
    async getForecastHistory(userId, limit = 10) {
        return await ForecastSnapshot.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
    }

    /**
     * Simulate a custom scenario
     */
    async simulateScenario(userId, scenarioConfig) {
        const { adjustments, baseSnapshotId } = scenarioConfig;

        // Get base forecast
        let baseForecast;
        if (baseSnapshotId) {
            baseForecast = await ForecastSnapshot.findById(baseSnapshotId);
        } else {
            baseForecast = await this.getLatestForecast(userId);
        }

        if (!baseForecast) {
            throw new Error('No base forecast found. Generate a forecast first.');
        }

        // Clone the base projection
        let simulatedProjection = JSON.parse(JSON.stringify(baseForecast.dataPoints));

        // Apply adjustments
        adjustments.forEach(adj => {
            const adjustDate = new Date(adj.startDate);

            simulatedProjection.forEach((point, index) => {
                const pointDate = new Date(point.date);

                if (adj.type === 'one_time' && pointDate >= adjustDate) {
                    // One-time expense affects all future balances
                    if (index > 0 && new Date(simulatedProjection[index - 1].date) < adjustDate) {
                        // This is the first point after the adjustment
                        point.predictedBalance -= adj.amount;
                    } else if (pointDate > adjustDate) {
                        point.predictedBalance -= adj.amount;
                    }
                } else if (adj.type === 'recurring_add' && pointDate >= adjustDate) {
                    // Recurring income - add monthly
                    const daysFromStart = Math.floor((pointDate - adjustDate) / (1000 * 60 * 60 * 24));
                    const monthsPassed = Math.floor(daysFromStart / 30);
                    point.predictedBalance += (monthsPassed * adj.amount);
                } else if (adj.type === 'recurring_remove' && pointDate >= adjustDate) {
                    // Recurring expense reduction - save monthly
                    const daysFromStart = Math.floor((pointDate - adjustDate) / (1000 * 60 * 60 * 24));
                    const monthsPassed = Math.floor(daysFromStart / 30);
                    point.predictedBalance += (monthsPassed * adj.amount);
                }
            });
        });

        // Calculate new runway
        const newRunway = forecastingEngine.calculateRunway(simulatedProjection);
        const runwayImpact = newRunway - baseForecast.predictedRunwayDays;

        return {
            original: baseForecast.dataPoints,
            simulated: simulatedProjection,
            originalRunway: baseForecast.predictedRunwayDays,
            simulatedRunway: newRunway,
            runwayImpact,
            projectionDate: new Date()
        };
    }

    /**
     * Get alert status for negative balance predictions
     */
    async getAlertStatus(userId) {
        const forecast = await this.getLatestForecast(userId);

        if (!forecast) {
            return { hasAlert: false, message: 'No forecast available' };
        }

        const alerts = [];

        // Check for imminent negative balance
        if (forecast.predictedRunwayDays !== null) {
            if (forecast.predictedRunwayDays <= 7) {
                alerts.push({
                    severity: 'critical',
                    message: `URGENT: Predicted negative balance in ${forecast.predictedRunwayDays} days`,
                    daysRemaining: forecast.predictedRunwayDays
                });
            } else if (forecast.predictedRunwayDays <= 30) {
                alerts.push({
                    severity: 'warning',
                    message: `Warning: Predicted negative balance in ${forecast.predictedRunwayDays} days`,
                    daysRemaining: forecast.predictedRunwayDays
                });
            } else if (forecast.predictedRunwayDays <= 60) {
                alerts.push({
                    severity: 'info',
                    message: `Advisory: You have ${forecast.predictedRunwayDays} days of runway`,
                    daysRemaining: forecast.predictedRunwayDays
                });
            }
        }

        // Check burn rate
        if (forecast.burnRate > 0) {
            alerts.push({
                severity: 'info',
                message: `Current burn rate: $${forecast.burnRate.toFixed(2)}/month`,
                burnRate: forecast.burnRate
            });
        }

        return {
            hasAlert: alerts.length > 0,
            alerts,
            confidenceScore: forecast.confidenceScore,
            lastUpdated: forecast.createdAt
        };
    }
}

module.exports = new CashFlowForecastService();
