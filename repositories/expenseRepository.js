const BaseRepository = require('./baseRepository');
const Expense = require('../models/Expense');
const ledgerService = require('../services/ledgerService');

/**
 * ExpenseRepository - Data Access Layer for Expense operations
 * Encapsulates all database queries related to expenses
 */
class ExpenseRepository extends BaseRepository {
    constructor() {
        super(Expense);
    }

    /**
     * Event-Sourced Update
     */
    async updateOne(filters, data, options = { new: true, runValidators: true }) {
        const doc = await this.model.findOne(filters);
        if (!doc) return null;

        const updatedDoc = await super.updateOne(filters, data, options);

        // Record UPDATE event
        const event = await ledgerService.recordEvent(
            doc._id,
            'UPDATED',
            data,
            doc.user // Assumes user exists on doc
        );

        updatedDoc.ledgerSequence = event.sequence;
        updatedDoc.lastLedgerEventId = event._id;
        await updatedDoc.save();

        return updatedDoc;
    }

    /**
     * Event-Sourced Delete
     */
    async deleteOne(filters) {
        const doc = await this.model.findOne(filters);
        if (!doc) return null;

        // Record DELETE event BEFORE actual deletion or use a tombstone
        await ledgerService.recordEvent(
            doc._id,
            'DELETED',
            { deletedAt: new Date() },
            doc.user
        );

        return await super.deleteOne(filters);
    }

    /**
     * Find expenses by user with filters
     */
    async findByUser(userId, filters = {}, options = {}) {
        const query = { user: userId, ...filters };
        return await this.findAll(query, options);
    }

    /**
     * Find expenses by user with pagination
     */
    async findByUserPaginated(userId, filters = {}, options = {}) {
        const query = { user: userId, ...filters };
        return await this.findWithPagination(query, options);
    }

    /**
     * Find expenses by workspace
     */
    async findByWorkspace(workspaceId, filters = {}, options = {}) {
        const query = { workspace: workspaceId, ...filters };
        return await this.findAll(query, options);
    }

    /**
     * Find expenses by workspace with pagination
     */
    async findByWorkspacePaginated(workspaceId, filters = {}, options = {}) {
        const query = { workspace: workspaceId, ...filters };
        return await this.findWithPagination(query, options);
    }

    /**
     * Find expenses by date range
     */
    async findByDateRange(userId, startDate, endDate, options = {}) {
        const query = {
            user: userId,
            date: { $gte: startDate, $lte: endDate }
        };
        return await this.findAll(query, options);
    }

    /**
     * Find expenses by category
     */
    async findByCategory(userId, category, options = {}) {
        const query = { user: userId, category };
        return await this.findAll(query, options);
    }

    /**
     * Find expenses by type (income/expense)
     */
    async findByType(userId, type, options = {}) {
        const query = { user: userId, type };
        return await this.findAll(query, options);
    }

    /**
     * Get total expenses for user
     */
    async getTotalByUser(userId, filters = {}) {
        const pipeline = [
            { $match: { user: userId, type: 'expense', ...filters } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ];

        const result = await this.aggregate(pipeline);
        return result.length > 0 ? result[0].total : 0;
    }

    /**
     * Get total income for user
     */
    async getTotalIncomeByUser(userId, filters = {}) {
        const pipeline = [
            { $match: { user: userId, type: 'income', ...filters } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ];

        const result = await this.aggregate(pipeline);
        return result.length > 0 ? result[0].total : 0;
    }

    /**
     * Get expenses grouped by category
     */
    async getByCategory(userId, startDate = null, endDate = null) {
        const matchStage = { user: userId, type: 'expense' };

        if (startDate && endDate) {
            matchStage.date = { $gte: startDate, $lte: endDate };
        }

        const pipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 },
                    avgAmount: { $avg: '$amount' }
                }
            },
            { $sort: { total: -1 } }
        ];

        return await this.aggregate(pipeline);
    }

    /**
     * Get expenses grouped by month
     */
    async getByMonth(userId, year) {
        const pipeline = [
            {
                $match: {
                    user: userId,
                    date: {
                        $gte: new Date(year, 0, 1),
                        $lte: new Date(year, 11, 31, 23, 59, 59)
                    }
                }
            },
            {
                $group: {
                    _id: { $month: '$date' },
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ];

        return await this.aggregate(pipeline);
    }

    /**
     * Get recent expenses
     */
    async getRecent(userId, limit = 10) {
        return await this.findByUser(userId, {}, {
            sort: { date: -1 },
            limit
        });
    }

    /**
     * Search expenses by description
     */
    async search(userId, searchTerm, options = {}) {
        const query = {
            user: userId,
            description: { $regex: searchTerm, $options: 'i' }
        };
        return await this.findAll(query, options);
    }

    /**
     * Find expenses requiring approval
     */
    async findPendingApproval(workspaceId, options = {}) {
        const query = {
            workspace: workspaceId,
            approvalStatus: 'pending_approval'
        };
        return await this.findAll(query, options);
    }

    /**
     * Find expenses by approval status
     */
    async findByApprovalStatus(workspaceId, status, options = {}) {
        const query = {
            workspace: workspaceId,
            approvalStatus: status
        };
        return await this.findAll(query, options);
    }

    /**
     * Get expense statistics for user
     */
    async getStatistics(userId, startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    user: userId,
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$type',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 },
                    avg: { $avg: '$amount' },
                    min: { $min: '$amount' },
                    max: { $max: '$amount' }
                }
            }
        ];

        return await this.aggregate(pipeline);
    }

    /**
     * Bulk update expenses
     */
    async bulkUpdateCategory(userId, oldCategory, newCategory) {
        return await this.updateMany(
            { user: userId, category: oldCategory },
            { category: newCategory }
        );
    }

    /**
     * Delete expenses by date range
     */
    async deleteByDateRange(userId, startDate, endDate) {
        return await this.deleteMany({
            user: userId,
            date: { $gte: startDate, $lte: endDate }
        });
    }

    /**
     * Get expense trends
     */
    async getTrends(userId, days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const pipeline = [
            {
                $match: {
                    user: userId,
                    date: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$date' }
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
            { $sort: { _id: 1 } }
        ];

        return await this.aggregate(pipeline);
    }
}

module.exports = new ExpenseRepository();
