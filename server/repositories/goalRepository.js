const BaseRepository = require('./baseRepository');
const Goal = require('../models/Goal');

/**
 * GoalRepository - Data Access Layer for Goal operations
 */
class GoalRepository extends BaseRepository {
    constructor() {
        super(Goal);
    }

    /**
     * Find goals by user
     */
    async findByUser(userId, filters = {}, options = {}) {
        const query = { user: userId, ...filters };
        return await this.findAll(query, options);
    }

    /**
     * Find active goals by user
     */
    async findActiveByUser(userId) {
        return await this.findAll({
            user: userId,
            status: 'active'
        }, { sort: { createdAt: -1 } });
    }

    /**
     * Find completed goals by user
     */
    async findCompletedByUser(userId) {
        return await this.findAll({
            user: userId,
            status: 'completed'
        }, { sort: { completedAt: -1 } });
    }

    /**
     * Find goals by status
     */
    async findByStatus(userId, status) {
        return await this.findAll({
            user: userId,
            status
        }, { sort: { createdAt: -1 } });
    }

    /**
     * Find goals by target date range
     */
    async findByTargetDateRange(userId, startDate, endDate) {
        return await this.findAll({
            user: userId,
            targetDate: { $gte: startDate, $lte: endDate }
        }, { sort: { targetDate: 1 } });
    }

    /**
     * Find overdue goals
     */
    async findOverdue(userId) {
        return await this.findAll({
            user: userId,
            status: 'active',
            targetDate: { $lt: new Date() }
        }, { sort: { targetDate: 1 } });
    }

    /**
     * Find goals near completion (>= threshold%)
     */
    async findNearCompletion(userId, threshold = 80) {
        const pipeline = [
            {
                $match: {
                    user: userId,
                    status: 'active'
                }
            },
            {
                $addFields: {
                    progress: {
                        $multiply: [
                            { $divide: ['$currentAmount', '$targetAmount'] },
                            100
                        ]
                    }
                }
            },
            {
                $match: {
                    progress: { $gte: threshold, $lt: 100 }
                }
            },
            { $sort: { progress: -1 } }
        ];

        return await this.aggregate(pipeline);
    }

    /**
     * Update goal progress
     */
    async updateProgress(goalId, amount) {
        return await this.updateById(goalId, {
            $inc: { currentAmount: amount }
        });
    }

    /**
     * Add contribution to goal
     */
    async addContribution(goalId, contribution) {
        return await this.updateById(goalId, {
            $inc: { currentAmount: contribution.amount },
            $push: { contributions: contribution }
        });
    }

    /**
     * Mark goal as completed
     */
    async markCompleted(goalId) {
        return await this.updateById(goalId, {
            status: 'completed',
            completedAt: new Date()
        });
    }

    /**
     * Mark goal as paused
     */
    async markPaused(goalId) {
        return await this.updateById(goalId, {
            status: 'paused'
        });
    }

    /**
     * Resume goal
     */
    async resume(goalId) {
        return await this.updateById(goalId, {
            status: 'active'
        });
    }

    /**
     * Get goal statistics for user
     */
    async getStatistics(userId) {
        const pipeline = [
            { $match: { user: userId } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalTarget: { $sum: '$targetAmount' },
                    totalCurrent: { $sum: '$currentAmount' }
                }
            }
        ];

        return await this.aggregate(pipeline);
    }

    /**
     * Get goal summary for user
     */
    async getSummary(userId) {
        const pipeline = [
            { $match: { user: userId } },
            {
                $group: {
                    _id: null,
                    totalGoals: { $sum: 1 },
                    activeGoals: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    },
                    completedGoals: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    totalTargetAmount: { $sum: '$targetAmount' },
                    totalCurrentAmount: { $sum: '$currentAmount' },
                    avgProgress: {
                        $avg: {
                            $multiply: [
                                { $divide: ['$currentAmount', '$targetAmount'] },
                                100
                            ]
                        }
                    }
                }
            }
        ];

        const result = await this.aggregate(pipeline);
        return result[0] || {
            totalGoals: 0,
            activeGoals: 0,
            completedGoals: 0,
            totalTargetAmount: 0,
            totalCurrentAmount: 0,
            avgProgress: 0
        };
    }

    /**
     * Find goals by workspace
     */
    async findByWorkspace(workspaceId, options = {}) {
        return await this.findAll({ workspace: workspaceId }, options);
    }

    /**
     * Get goals with milestones
     */
    async findWithMilestones(userId) {
        return await this.findAll(
            { user: userId },
            { sort: { createdAt: -1 } }
        );
    }
}

module.exports = new GoalRepository();
