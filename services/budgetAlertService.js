/**
 * Budget Alert Service
 * Issue #554: Budget Planning & Variance Analysis System
 * Alert generation when thresholds exceeded
 */

const Budget = require('../models/Budget');
const BudgetSnapshot = require('../models/BudgetSnapshot');

class BudgetAlertService {
    /**
     * Check all active budgets for alerts
     */
    async checkAllBudgets(userId) {
        const activeBudgets = await Budget.find({
            userId,
            status: 'active'
        });

        const alerts = [];

        for (const budget of activeBudgets) {
            const budgetAlerts = await this.checkBudget(budget);
            alerts.push(...budgetAlerts);
        }

        return alerts;
    }

    /**
     * Check a single budget for alert conditions
     */
    async checkBudget(budget) {
        const alerts = [];

        // Check overall budget
        const overallPercentage = budget.totalAllocated > 0
            ? (budget.totalSpent / budget.totalAllocated) * 100
            : 0;

        if (overallPercentage >= 100) {
            alerts.push({
                budgetId: budget._id,
                budgetName: budget.name,
                level: 'exceeded',
                type: 'overall',
                message: `Budget "${budget.name}" has been exceeded (${overallPercentage.toFixed(1)}%)`,
                percentage: overallPercentage,
                amount: budget.totalSpent - budget.totalAllocated
            });
        } else if (overallPercentage >= budget.alertThresholds?.critical || 90) {
            alerts.push({
                budgetId: budget._id,
                budgetName: budget.name,
                level: 'critical',
                type: 'overall',
                message: `Budget "${budget.name}" is at ${overallPercentage.toFixed(1)}% (Critical threshold)`,
                percentage: overallPercentage
            });
        } else if (overallPercentage >= (budget.alertThresholds?.warning || 80)) {
            alerts.push({
                budgetId: budget._id,
                budgetName: budget.name,
                level: 'warning',
                type: 'overall',
                message: `Budget "${budget.name}" is at ${overallPercentage.toFixed(1)}% (Warning threshold)`,
                percentage: overallPercentage
            });
        }

        // Check each category
        if (budget.categories) {
            budget.categories.forEach(category => {
                const categoryAlerts = this.checkCategory(budget, category);
                alerts.push(...categoryAlerts);
            });
        }

        // Check days remaining
        const daysRemaining = budget.daysRemaining;
        if (daysRemaining <= 3 && overallPercentage > 50) {
            alerts.push({
                budgetId: budget._id,
                budgetName: budget.name,
                level: 'warning',
                type: 'time',
                message: `Only ${daysRemaining} day(s) remaining in "${budget.name}" budget period`,
                daysRemaining
            });
        }

        // Store alerts in budget
        budget.alerts = budget.alerts || [];
        alerts.forEach(alert => {
            const exists = budget.alerts.find(a =>
                a.message === alert.message && !a.acknowledged
            );
            if (!exists) {
                budget.alerts.push({
                    level: alert.level,
                    categoryName: alert.categoryName,
                    message: alert.message,
                    triggeredAt: new Date(),
                    acknowledged: false
                });
            }
        });

        await budget.save();

        return alerts;
    }

    /**
     * Check single category for alerts
     */
    checkCategory(budget, category) {
        const alerts = [];
        const percentage = category.percentageUsed || 0;

        if (percentage >= 100) {
            alerts.push({
                budgetId: budget._id,
                budgetName: budget.name,
                categoryName: category.categoryName,
                level: 'exceeded',
                type: 'category',
                message: `Category "${category.categoryName}" exceeded budget (${percentage.toFixed(1)}%)`,
                percentage,
                amount: category.spentAmount - category.allocatedAmount
            });
        } else if (percentage >= (budget.alertThresholds?.critical || 90)) {
            alerts.push({
                budgetId: budget._id,
                budgetName: budget.name,
                categoryName: category.categoryName,
                level: 'critical',
                type: 'category',
                message: `Category "${category.categoryName}" at ${percentage.toFixed(1)}% (Critical)`,
                percentage
            });
        } else if (percentage >= (budget.alertThresholds?.warning || 80)) {
            alerts.push({
                budgetId: budget._id,
                budgetName: budget.name,
                categoryName: category.categoryName,
                level: 'warning',
                type: 'category',
                message: `Category "${category.categoryName}" at ${percentage.toFixed(1)}% (Warning)`,
                percentage
            });
        }

        return alerts;
    }

    /**
     * Get unacknowledged alerts for user
     */
    async getActiveAlerts(userId) {
        const budgets = await Budget.find({
            userId,
            status: 'active'
        });

        const activeAlerts = [];

        budgets.forEach(budget => {
            if (budget.alerts) {
                budget.alerts.forEach(alert => {
                    if (!alert.acknowledged) {
                        activeAlerts.push({
                            budgetId: budget._id,
                            budgetName: budget.name,
                            ...alert.toObject()
                        });
                    }
                });
            }
        });

        return activeAlerts.sort((a, b) => {
            const levelOrder = { exceeded: 0, critical: 1, warning: 2 };
            return levelOrder[a.level] - levelOrder[b.level];
        });
    }

    /**
     * Acknowledge an alert
     */
    async acknowledgeAlert(budgetId, alertIndex) {
        const budget = await Budget.findById(budgetId);

        if (!budget || !budget.alerts || !budget.alerts[alertIndex]) {
            throw new Error('Alert not found');
        }

        budget.alerts[alertIndex].acknowledged = true;
        await budget.save();

        return budget.alerts[alertIndex];
    }

    /**
     * Clear all acknowledged alerts
     */
    async clearAcknowledgedAlerts(budgetId) {
        const budget = await Budget.findById(budgetId);

        if (!budget) {
            throw new Error('Budget not found');
        }

        budget.alerts = budget.alerts.filter(a => !a.acknowledged);
        await budget.save();

        return budget;
    }

    /**
     * Get alert statistics
     */
    async getAlertStatistics(userId, days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const budgets = await Budget.find({
            userId,
            updatedAt: { $gte: startDate }
        });

        const stats = {
            totalAlerts: 0,
            byLevel: {
                exceeded: 0,
                critical: 0,
                warning: 0
            },
            byType: {
                overall: 0,
                category: 0,
                time: 0
            },
            acknowledged: 0,
            unacknowledged: 0,
            mostAlerted: []
        };

        const budgetAlertCounts = new Map();

        budgets.forEach(budget => {
            if (budget.alerts) {
                budget.alerts.forEach(alert => {
                    stats.totalAlerts++;
                    stats.byLevel[alert.level] = (stats.byLevel[alert.level] || 0) + 1;

                    if (alert.acknowledged) {
                        stats.acknowledged++;
                    } else {
                        stats.unacknowledged++;
                    }

                    // Track budget alert counts
                    const count = budgetAlertCounts.get(budget.name) || 0;
                    budgetAlertCounts.set(budget.name, count + 1);
                });
            }
        });

        // Get most alerted budgets
        stats.mostAlerted = Array.from(budgetAlertCounts.entries())
            .map(([name, count]) => ({ budgetName: name, alertCount: count }))
            .sort((a, b) => b.alertCount - a.alertCount)
            .slice(0, 5);

        return stats;
    }

    /**
     * Generate predictive alerts
     */
    async generatePredictiveAlerts(budget) {
        const alerts = [];
        const daysRemaining = budget.daysRemaining;

        if (daysRemaining <= 0) return alerts;

        // Calculate daily spending rate
        const now = new Date();
        const startDate = new Date(budget.startDate);
        const daysElapsed = Math.max(1, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));
        const dailySpendingRate = budget.totalSpent / daysElapsed;

        // Project total spending
        const totalDays = Math.ceil((new Date(budget.endDate) - startDate) / (1000 * 60 * 60 * 24));
        const projectedTotal = dailySpendingRate * totalDays;

        // Check if projected to exceed
        if (projectedTotal > budget.totalAllocated) {
            const projectedOverage = projectedTotal - budget.totalAllocated;
            alerts.push({
                budgetId: budget._id,
                budgetName: budget.name,
                level: 'warning',
                type: 'predictive',
                message: `At current spending rate, budget "${budget.name}" is projected to exceed by $${projectedOverage.toFixed(2)}`,
                projectedTotal,
                projectedOverage,
                dailySpendingRate
            });
        }

        // Check categories
        if (budget.categories) {
            budget.categories.forEach(category => {
                const categoryDailyRate = category.spentAmount / daysElapsed;
                const categoryProjected = categoryDailyRate * totalDays;

                if (categoryProjected > category.allocatedAmount) {
                    const overage = categoryProjected - category.allocatedAmount;
                    alerts.push({
                        budgetId: budget._id,
                        budgetName: budget.name,
                        categoryName: category.categoryName,
                        level: 'warning',
                        type: 'predictive',
                        message: `Category "${category.categoryName}" projected to exceed by $${overage.toFixed(2)}`,
                        projectedTotal: categoryProjected,
                        projectedOverage: overage
                    });
                }
            });
        }

        return alerts;
    }

    /**
     * Send alert notifications (placeholder - integrate with notification system)
     */
    async sendAlertNotifications(userId, alerts) {
        // This would integrate with email/push notification service
        // For now, just return the alerts that would be sent

        const notifications = alerts.map(alert => ({
            userId,
            type: 'budget_alert',
            title: `Budget Alert: ${alert.level.toUpperCase()}`,
            message: alert.message,
            level: alert.level,
            data: alert,
            timestamp: new Date()
        }));

        return notifications;
    }
}

module.exports = new BudgetAlertService();
