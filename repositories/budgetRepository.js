const BaseRepository = require('./baseRepository');
const Budget = require('../models/Budget');

/**
 * BudgetRepository - Data Access Layer for Budget operations
 */
class BudgetRepository extends BaseRepository {
    constructor() {
        super(Budget);
    }

    /**
     * Find budgets by user
     */
    async findByUser(userId, filters = {}, options = {}) {
        const query = { user: userId, ...filters };
        return await this.findAll(query, options);
    }

    /**
     * Find active budgets by user
     */
    async findActiveByUser(userId) {
        return await this.findAll({
            user: userId,
            isActive: true
        }, { sort: { createdAt: -1 } });
    }

    /**
     * Find budgets by period
     */
    async findByPeriod(userId, period) {
        return await this.findAll({
            user: userId,
            period
        }, { sort: { createdAt: -1 } });
    }

    /**
     * Find budget by category and period
     */
    async findByCategoryAndPeriod(userId, category, period) {
        return await this.findOne({
            user: userId,
            category,
            period,
            isActive: true
        });
    }

    /**
     * Find budgets exceeding limit
     */
    async findExceeding(userId) {
        const pipeline = [
            {
                $match: {
                    user: userId,
                    isActive: true
                }
            },
            {
                $addFields: {
                    percentageUsed: {
                        $multiply: [
                            { $divide: ['$spent', '$limit'] },
                            100
                        ]
                    }
                }
            },
            {
                $match: {
                    percentageUsed: { $gte: 100 }
                }
            }
        ];

        return await this.aggregate(pipeline);
    }

    /**
     * Find budgets near limit (>= threshold%)
     */
    async findNearLimit(userId, threshold = 80) {
        const pipeline = [
            {
                $match: {
                    user: userId,
                    isActive: true
                }
            },
            {
                $addFields: {
                    percentageUsed: {
                        $multiply: [
                            { $divide: ['$spent', '$limit'] },
                            100
                        ]
                    }
                }
            },
            {
                $match: {
                    percentageUsed: { $gte: threshold, $lt: 100 }
                }
            }
        ];

        return await this.aggregate(pipeline);
    }

    /**
     * Update budget spent amount
     */
    async updateSpent(budgetId, amount) {
        return await this.updateById(budgetId, {
            $inc: { spent: amount }
        });
    }

    /**
     * Reset budget spent amount
     */
    async resetSpent(budgetId) {
        return await this.updateById(budgetId, { spent: 0 });
    }

    /**
     * Deactivate budget
     */
    async deactivate(budgetId) {
        return await this.updateById(budgetId, { isActive: false });
    }

    /**
     * Activate budget
     */
    async activate(budgetId) {
        return await this.updateById(budgetId, { isActive: true });
    }

    /**
     * Get budget summary for user
     */
    async getSummary(userId, period = null) {
        const matchStage = { user: userId, isActive: true };
        if (period) matchStage.period = period;

        const pipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalLimit: { $sum: '$limit' },
                    totalSpent: { $sum: '$spent' },
                    budgetCount: { $sum: 1 },
                    avgUtilization: {
                        $avg: {
                            $multiply: [
                                { $divide: ['$spent', '$limit'] },
                                100
                            ]
                        }
                    }
                }
            }
        ];

        const result = await this.aggregate(pipeline);
        return result[0] || {
            totalLimit: 0,
            totalSpent: 0,
            budgetCount: 0,
            avgUtilization: 0
        };
    }

    /**
     * Find budgets by workspace
     */
    async findByWorkspace(workspaceId, options = {}) {
        return await this.findAll({ workspace: workspaceId }, options);
    }
}

module.exports = new BudgetRepository();
