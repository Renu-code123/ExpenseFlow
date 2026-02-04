const Expense = require('../models/Expense');
const RecurringExpense = require('../models/RecurringExpense');
const Goal = require('../models/Goal');
const mongoose = require('mongoose');

class ForecastingService {
    constructor() {
        // Runway calculation thresholds
        this.CRITICAL_RUNWAY_DAYS = 7;
        this.WARNING_RUNWAY_DAYS = 14;
        this.COMFORTABLE_RUNWAY_DAYS = 30;
    }

    /**
     * Calculate Liquidity Runway - days until funds depleted
     * Issue #444: Predictive Subscription Detection & Cashflow Runway
     * @param {string} userId - User ID
     * @returns {Object} Runway calculation with breakdown
     */
    async calculateRunway(userId) {
        const now = new Date();
        
        // 1. Get current balance
        const balanceData = await Expense.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: null,
                    income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
                    expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } }
                }
            }
        ]);

        const currentBalance = balanceData.length > 0 
            ? (balanceData[0].income - balanceData[0].expense) 
            : 0;

        // 2. Calculate burn rate from recurring expenses
        const recurringExpenses = await RecurringExpense.find({
            user: userId,
            isActive: true,
            isPaused: false,
            type: 'expense'
        });

        const monthlyRecurringBurn = recurringExpenses.reduce((total, item) => {
            return total + item.getMonthlyEstimate();
        }, 0);

        // 3. Calculate variable spending from historical data (last 90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const variableSpending = await Expense.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    type: 'expense',
                    date: { $gte: ninetyDaysAgo }
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

        const avgDailyVariable = variableSpending.length > 0 
            ? (variableSpending[0].total / 90)
            : 0;

        // 4. Get expected income (from recurring income entries)
        const recurringIncome = await RecurringExpense.find({
            user: userId,
            isActive: true,
            isPaused: false,
            type: 'income'
        });

        const monthlyRecurringIncome = recurringIncome.reduce((total, item) => {
            return total + item.getMonthlyEstimate();
        }, 0);

        // 5. Calculate net burn rate
        const dailyRecurringBurn = monthlyRecurringBurn / 30;
        const dailyRecurringIncome = monthlyRecurringIncome / 30;
        const netDailyBurn = (dailyRecurringBurn + avgDailyVariable) - dailyRecurringIncome;

        // 6. Calculate runway days
        let runwayDays = 0;
        let runwayStatus = 'critical';
        let runwayMessage = '';

        if (netDailyBurn <= 0) {
            // Positive cash flow
            runwayDays = Infinity;
            runwayStatus = 'positive';
            runwayMessage = 'Your income exceeds your expenses. You have positive cash flow!';
        } else if (currentBalance <= 0) {
            runwayDays = 0;
            runwayStatus = 'depleted';
            runwayMessage = 'Your balance is depleted or negative.';
        } else {
            runwayDays = Math.floor(currentBalance / netDailyBurn);
            
            if (runwayDays >= this.COMFORTABLE_RUNWAY_DAYS) {
                runwayStatus = 'comfortable';
                runwayMessage = `You have ${runwayDays} days of runway. You're in a comfortable position.`;
            } else if (runwayDays >= this.WARNING_RUNWAY_DAYS) {
                runwayStatus = 'moderate';
                runwayMessage = `You have ${runwayDays} days of runway. Consider reducing expenses.`;
            } else if (runwayDays >= this.CRITICAL_RUNWAY_DAYS) {
                runwayStatus = 'warning';
                runwayMessage = `Only ${runwayDays} days of runway remaining. Review your subscriptions.`;
            } else {
                runwayStatus = 'critical';
                runwayMessage = `Critical: Only ${runwayDays} days until funds depleted!`;
            }
        }

        // 7. Project balance for next 30 days
        const projectedBalances = [];
        let projectedBalance = currentBalance;

        for (let day = 0; day <= 30; day++) {
            const date = new Date(now);
            date.setDate(date.getDate() + day);
            
            projectedBalances.push({
                day,
                date: date.toISOString().split('T')[0],
                balance: Math.round(projectedBalance * 100) / 100,
                isNegative: projectedBalance < 0
            });

            // Subtract daily burn for next iteration
            if (day < 30) {
                projectedBalance -= netDailyBurn;
            }
        }

        // 8. Find zero-crossing day
        const zeroCrossingDay = projectedBalances.find(p => p.balance <= 0);

        return {
            currentBalance: Math.round(currentBalance * 100) / 100,
            burnRate: {
                daily: Math.round(netDailyBurn * 100) / 100,
                weekly: Math.round(netDailyBurn * 7 * 100) / 100,
                monthly: Math.round(netDailyBurn * 30 * 100) / 100
            },
            breakdown: {
                monthlyRecurringExpenses: Math.round(monthlyRecurringBurn * 100) / 100,
                monthlyRecurringIncome: Math.round(monthlyRecurringIncome * 100) / 100,
                avgDailyVariableSpending: Math.round(avgDailyVariable * 100) / 100,
                recurringExpenseCount: recurringExpenses.length,
                recurringIncomeCount: recurringIncome.length
            },
            runway: {
                days: runwayDays === Infinity ? null : runwayDays,
                status: runwayStatus,
                message: runwayMessage,
                isPositiveCashFlow: netDailyBurn <= 0
            },
            projection: projectedBalances,
            zeroCrossingDate: zeroCrossingDay ? zeroCrossingDay.date : null,
            calculatedAt: now
        };
    }

    /**
     * Get runway summary for dashboard display
     */
    async getRunwaySummary(userId) {
        const runway = await this.calculateRunway(userId);
        
        // Calculate progress percentage (max 100 at 60 days)
        let progressPercent = 0;
        if (runway.runway.isPositiveCashFlow) {
            progressPercent = 100;
        } else if (runway.runway.days !== null) {
            progressPercent = Math.min(100, Math.round((runway.runway.days / 60) * 100));
        }

        return {
            days: runway.runway.days,
            status: runway.runway.status,
            message: runway.runway.message,
            progressPercent,
            burnRate: runway.burnRate.daily,
            currentBalance: runway.currentBalance,
            isPositiveCashFlow: runway.runway.isPositiveCashFlow
        };
    }

    /**
     * Get detailed cash flow forecast for the next 30 days
     */
    async getForecast(userId) {
        const now = new Date();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const daysInMonth = endOfMonth.getDate();
        const currentDay = now.getDate();
        const remainingDays = Math.max(1, daysInMonth - currentDay + 1);

        // 1. Get current balance (simplified calculation)
        const balanceData = await Expense.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: null,
                    income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
                    expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } }
                }
            }
        ]);

        const currentBalance = balanceData.length > 0 ? (balanceData[0].income - balanceData[0].expense) : 0;

        // 2. Get upcoming recurring expenses for the rest of the month
        const upcomingRecurring = await RecurringExpense.find({
            user: userId,
            isActive: true,
            isPaused: false,
            nextDueDate: { $gte: now, $lte: endOfMonth }
        });

        const totalUpcomingRecurring = upcomingRecurring.reduce((sum, item) => {
            return item.type === 'expense' ? sum + item.amount : sum - item.amount;
        }, 0);

        // 3. Get monthly goal allocations
        const activeGoals = await Goal.find({
            user: userId,
            status: 'active',
            targetDate: { $gt: now }
        });

        const monthlyGoalTargets = activeGoals.reduce((sum, goal) => {
            const monthsLeft = Math.max(1, (goal.targetDate.getFullYear() - now.getFullYear()) * 12 + (goal.targetDate.getMonth() - now.getMonth()));
            const monthlyTarget = (goal.targetAmount - goal.currentAmount) / monthsLeft;
            return sum + Math.max(0, monthlyTarget);
        }, 0);

        // 4. Calculate Safe-to-Spend
        // (Current Balance - Total Future Recurring Expenses - Pro-rated Goal Targets)
        const totalCommitments = totalUpcomingRecurring + monthlyGoalTargets;
        const safeToSpendTotal = Math.max(0, currentBalance - totalCommitments);
        const safeToSpendDaily = safeToSpendTotal / remainingDays;

        // 5. Generate daily projection data for the next 30 days
        const projectionData = await this.generateProjection(userId, currentBalance, upcomingRecurring, activeGoals);

        // 6. Anomaly Detection (recent vs historical average)
        const anomalies = await this.detectAnomalies(userId);

        return {
            safeToSpend: {
                daily: Math.round(safeToSpendDaily * 100) / 100,
                total: Math.round(safeToSpendTotal * 100) / 100,
                remainingDays,
                commitments: {
                    recurring: Math.round(totalUpcomingRecurring * 100) / 100,
                    goals: Math.round(monthlyGoalTargets * 100) / 100
                }
            },
            projection: projectionData,
            anomalies,
            currentBalance: Math.round(currentBalance * 100) / 100,
            generatedAt: now
        };
    }

    /**
     * Generate daily balance projection for next 30 days
     */
    async generateProjection(userId, startBalance, recurring, goals) {
        const projection = [];
        let runningBalance = startBalance;
        const now = new Date();

        // Get average daily spending from last 90 days to include in projection
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);

        const historicalStats = await Expense.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    date: { $gte: threeMonthsAgo },
                    type: 'expense'
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const avgDailySpend = historicalStats.length > 0 ? (historicalStats[0].total / 90) : 0;

        for (let i = 0; i <= 30; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() + i);
            date.setHours(0, 0, 0, 0);

            // Subtract average daily spend
            if (i > 0) runningBalance -= avgDailySpend;

            // Apply recurring items that fall on this day
            recurring.forEach(item => {
                const itemDate = new Date(item.nextDueDate);
                itemDate.setHours(0, 0, 0, 0);
                if (itemDate.getTime() === date.getTime()) {
                    runningBalance += (item.type === 'income' ? item.amount : -item.amount);
                }
            });

            projection.push({
                date: date.toISOString().split('T')[0],
                balance: Math.round(runningBalance * 100) / 100,
                isPredicted: i > 0
            });
        }

        return projection;
    }

    /**
     * Detect spending anomalies
     */
    async detectAnomalies(userId) {
        const anomalies = [];
        const now = new Date();
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());

        // 1. Get spending by category for the current week
        const currentWeekSpending = await Expense.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    type: 'expense',
                    date: { $gte: startOfWeek }
                }
            },
            { $group: { _id: '$category', total: { $sum: '$amount' } } }
        ]);

        // 2. Get average weekly spending by category (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const historicalSpending = await Expense.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    type: 'expense',
                    date: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        category: '$category',
                        week: { $week: '$date' },
                        year: { $year: '$date' }
                    },
                    total: { $sum: '$amount' }
                }
            },
            {
                $group: {
                    _id: '$_id.category',
                    avgWeekly: { $avg: '$total' }
                }
            }
        ]);

        // 3. Compare and flag anomalies (> 20% increase)
        currentWeekSpending.forEach(current => {
            const historical = historicalSpending.find(h => h._id === current._id);
            if (historical && historical.avgWeekly > 0) {
                const increase = ((current.total - historical.avgWeekly) / historical.avgWeekly) * 100;
                if (increase > 20) {
                    anomalies.push({
                        category: current._id,
                        currentAmount: Math.round(current.total * 100) / 100,
                        avgAmount: Math.round(historical.avgWeekly * 100) / 100,
                        increasePercent: Math.round(increase * 10) / 10,
                        message: `Spending in ${current._id} is ${Math.round(increase)}% higher than your weekly average.`
                    });
                }
            }
        });

        return anomalies;
    }
}

module.exports = new ForecastingService();
