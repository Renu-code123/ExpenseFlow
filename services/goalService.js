const goalRepository = require('../repositories/goalRepository');
const expenseRepository = require('../repositories/expenseRepository');
const mongoose = require('mongoose');

class GoalService {
    /**
     * Calculate progress for all active goals of a user
     */
    async updateGoalProgress(userId) {
        const goals = await goalRepository.findActiveByUser(userId);
        if (!goals.length) return [];

        // Get net savings for the month to see if we can auto-allocate
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const stats = await expenseRepository.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    date: { $gte: startOfMonth }
                }
            },
            {
                $group: {
                    _id: '$type',
                    total: { $sum: '$amount' }
                }
            }
        ]);

        let income = 0;
        let expense = 0;
        stats.forEach(s => {
            if (s._id === 'income') income = s.total;
            if (s._id === 'expense') expense = s.total;
        });

        const netSavings = Math.max(0, income - expense);

        // Logic for Suggesting auto-allocation remains same (display logic)
        // ... handled in frontend or separate suggestion engine

        return goals;
    }

    /**
     * Predict completion date based on historical savings rate
     */
    async predictCompletion(goalId, userId) {
        const goal = await goalRepository.findById(goalId);
        if (!goal) throw new Error('Goal not found');

        const remaining = goal.targetAmount - goal.currentAmount;
        if (remaining <= 0) return { status: 'completed' };

        // Calculate average monthly savings over last 3 months
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const stats = await expenseRepository.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    date: { $gte: threeMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: '$date' },
                        year: { $year: '$date' },
                        type: '$type'
                    },
                    total: { $sum: '$amount' }
                }
            }
        ]);

        // Calculate monthly net savings
        const monthlyNet = {};
        stats.forEach(s => {
            const key = `${s._id.year}-${s._id.month}`;
            if (!monthlyNet[key]) monthlyNet[key] = { income: 0, expense: 0 };
            if (s._id.type === 'income') monthlyNet[key].income = s.total;
            if (s._id.type === 'expense') monthlyNet[key].expense = s.total;
        });

        const months = Object.values(monthlyNet);
        const totalSavings = months.reduce((acc, m) => acc + (m.income - m.expense), 0);
        const avgMonthlySavings = totalSavings / (months.length || 1);

        if (avgMonthlySavings <= 0) {
            return {
                estimatedCompletionDate: null,
                message: 'No net savings detected to predict completion',
                avgMonthlySavings
            };
        }

        const monthsNeeded = remaining / avgMonthlySavings;
        const completionDate = new Date();
        completionDate.setMonth(completionDate.getMonth() + Math.ceil(monthsNeeded));

        return {
            estimatedCompletionDate: completionDate,
            monthsRemaining: Math.ceil(monthsNeeded),
            avgMonthlySavings,
            isOnTrack: completionDate <= goal.targetDate
        };
    }

    /**
     * Check milestones and return alerts
     */
    async checkMilestones(goalId) {
        const goal = await goalRepository.findById(goalId);
        if (!goal) return null;

        const progress = (goal.currentAmount / goal.targetAmount) * 100;
        const alerts = [];
        let updated = false;

        goal.milestones.forEach(m => {
            if (progress >= m.percentage && !m.achieved) {
                m.achieved = true;
                m.achievedDate = new Date();
                if (!m.isNotified) {
                    alerts.push({
                        type: 'milestone',
                        goalName: goal.title,
                        percentage: m.percentage,
                        message: `Congratulations! You've reached ${m.percentage}% of your goal "${goal.title}"!`
                    });
                    m.isNotified = true;
                    updated = true;
                }
            }
        });

        if (updated) {
            await goalRepository.updateById(goal._id, { milestones: goal.milestones });
        }

        return alerts;
    }

    /**
     * Analyze impact of a large expense on goals
     */
    async analyzeExpenseImpact(userId, amount) {
        const goals = await goalRepository.findActiveByUser(userId);
        if (!goals.length) return null;

        const impacts = await Promise.all(goals.map(async goal => {
            const prediction = await this.predictCompletion(goal._id, userId);

            // If no savings, we can't really measure impact on completion date
            if (!prediction.avgMonthlySavings || prediction.avgMonthlySavings <= 0) return null;

            // Displacement in days: expense_amount / (daily_savings_rate)
            const dailySavings = prediction.avgMonthlySavings / 30;
            const daysDelay = Math.ceil(amount / dailySavings);

            return {
                goalId: goal._id,
                goalName: goal.title,
                delayInDays: daysDelay,
                newEstimatedDate: prediction.estimatedCompletionDate ?
                    new Date(prediction.estimatedCompletionDate.getTime() + (daysDelay * 24 * 60 * 60 * 1000)) : null
            };
        }));

        return impacts.filter(i => i !== null);
    }
}

module.exports = new GoalService();
