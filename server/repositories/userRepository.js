const BaseRepository = require('./baseRepository');
const User = require('../models/User');

/**
 * UserRepository - Data Access Layer for User operations
 */
class UserRepository extends BaseRepository {
    constructor() {
        super(User);
    }

    /**
     * Find user by email
     */
    async findByEmail(email) {
        return await this.findOne({ email: email.toLowerCase() });
    }

    /**
     * Find user by email with password
     */
    async findByEmailWithPassword(email) {
        return await this.model.findOne({ email: email.toLowerCase() }).select('+password');
    }

    /**
     * Check if email exists
     */
    async emailExists(email) {
        return await this.exists({ email: email.toLowerCase() });
    }

    /**
     * Update user preferences
     */
    async updatePreferences(userId, preferences) {
        return await this.updateById(userId, { preferences });
    }

    /**
     * Update user settings
     */
    async updateSettings(userId, settings) {
        return await this.updateById(userId, settings);
    }

    /**
     * Find users by workspace
     */
    async findByWorkspace(workspaceId) {
        return await this.findAll({ workspaces: workspaceId });
    }

    /**
     * Add workspace to user
     */
    async addWorkspace(userId, workspaceId) {
        return await this.updateById(userId, {
            $addToSet: { workspaces: workspaceId }
        });
    }

    /**
     * Remove workspace from user
     */
    async removeWorkspace(userId, workspaceId) {
        return await this.updateById(userId, {
            $pull: { workspaces: workspaceId }
        });
    }

    /**
     * Update last login
     */
    async updateLastLogin(userId) {
        return await this.updateById(userId, { lastLogin: new Date() });
    }

    /**
     * Increment login count
     */
    async incrementLoginCount(userId) {
        return await this.updateById(userId, {
            $inc: { 'security.loginAttempts': 1 }
        });
    }

    /**
     * Reset login attempts
     */
    async resetLoginAttempts(userId) {
        return await this.updateById(userId, {
            'security.loginAttempts': 0,
            'security.lockoutUntil': null
        });
    }

    /**
     * Lock user account
     */
    async lockAccount(userId, lockoutUntil) {
        return await this.updateById(userId, {
            'security.lockoutUntil': lockoutUntil
        });
    }

    /**
     * Find active users (logged in within days)
     */
    async findActiveUsers(days = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        return await this.findAll({
            lastLogin: { $gte: cutoffDate }
        });
    }

    /**
     * Get user statistics
     */
    async getStatistics() {
        const pipeline = [
            {
                $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    activeUsers: {
                        $sum: {
                            $cond: [
                                { $gte: ['$lastLogin', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ];

        const result = await this.aggregate(pipeline);
        return result[0] || { totalUsers: 0, activeUsers: 0 };
    }
}

module.exports = new UserRepository();
