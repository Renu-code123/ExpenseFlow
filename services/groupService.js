const Group = require('../models/Group');
const User = require('../models/User');
const Expense = require('../models/Expense');
const SharedBudget = require('../models/SharedBudget');
const notificationService = require('./notificationService');

class GroupService {
  /**
   * Create a new group
   * @param {string} userId - User ID of the creator
   * @param {Object} groupData - Group data
   * @returns {Promise<Object>} Created group
   */
  async createGroup(userId, groupData) {
    try {
      const group = new Group({
        ...groupData,
        createdBy: userId,
        members: [{
          user: userId,
          role: 'admin',
          joinedAt: new Date(),
          isActive: true
        }]
      });

      await group.save();

      // Populate the result
      await group.populate('members.user', 'name email');
      await group.populate('createdBy', 'name email');

      return group;
    } catch (error) {
      console.error('Create group error:', error);
      throw error;
    }
  }

  /**
   * Get user's groups
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of user's groups
   */
  async getUserGroups(userId) {
    try {
      return await Group.findUserGroups(userId)
        .populate('createdBy', 'name email')
        .populate('members.user', 'name email')
        .sort({ createdAt: -1 });
    } catch (error) {
      console.error('Get user groups error:', error);
      throw error;
    }
  }

  /**
   * Get group by ID
   * @param {string} groupId - Group ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} Group object
   */
  async getGroupById(groupId, userId) {
    try {
      const group = await Group.findById(groupId)
        .populate('createdBy', 'name email')
        .populate('members.user', 'name email')
        .populate('expenses.expense', 'description amount category date')
        .populate('expenses.addedBy', 'name email');

      if (!group) {
        throw new Error('Group not found');
      }

      if (!group.isMember(userId)) {
        throw new Error('Access denied');
      }

      return group;
    } catch (error) {
      console.error('Get group by ID error:', error);
      throw error;
    }
  }

  /**
   * Add member to group
   * @param {string} groupId - Group ID
   * @param {string} userId - User ID of the adder (must be admin)
   * @param {string} email - Email of the user to add
   * @returns {Promise<Object>} Updated group
   */
  async addMember(groupId, userId, email) {
    try {
      const group = await Group.findById(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      if (!group.isAdmin(userId)) {
        throw new Error('Access denied');
      }

      // Find user by email
      const userToAdd = await User.findOne({ email });
      if (!userToAdd) {
        throw new Error('User not found');
      }

      // Check if already a member
      if (group.isMember(userToAdd._id)) {
        throw new Error('User is already a member of this group');
      }

      // Add member
      group.addMember(userToAdd._id);
      await group.save();

      // Populate and return
      await group.populate('members.user', 'name email');

      // Send notification
      await notificationService.sendNotification(userToAdd._id, {
        title: 'Added to Group',
        message: `You have been added to the group "${group.name}"`,
        type: 'group_invitation',
        priority: 'medium',
        data: {
          groupId: group._id,
          groupName: group.name
        }
      });

      return group;
    } catch (error) {
      console.error('Add member error:', error);
      throw error;
    }
  }

  /**
   * Remove member from group
   * @param {string} groupId - Group ID
   * @param {string} userId - User ID of the remover (must be admin)
   * @param {string} memberId - Member ID to remove
   * @returns {Promise<Object>} Updated group
   */
  async removeMember(groupId, userId, memberId) {
    try {
      const group = await Group.findById(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      if (!group.isAdmin(userId)) {
        throw new Error('Access denied');
      }

      // Cannot remove the creator/admin if they're the only admin
      const adminCount = group.members.filter(m => m.role === 'admin' && m.isActive).length;
      const memberToRemove = group.members.find(m => m.user.toString() === memberId.toString());

      if (memberToRemove && memberToRemove.role === 'admin' && adminCount <= 1) {
        throw new Error('Cannot remove the last admin from the group');
      }

      // Remove member
      group.removeMember(memberId);
      await group.save();

      // Populate and return
      await group.populate('members.user', 'name email');

      // Send notification
      await notificationService.sendNotification(memberId, {
        title: 'Removed from Group',
        message: `You have been removed from the group "${group.name}"`,
        type: 'group_removal',
        priority: 'medium',
        data: {
          groupId: group._id,
          groupName: group.name
        }
      });

      return group;
    } catch (error) {
      console.error('Remove member error:', error);
      throw error;
    }
  }

  /**
   * Add expense to group
   * @param {string} groupId - Group ID
   * @param {string} userId - User ID adding the expense
   * @param {string} expenseId - Expense ID
   * @returns {Promise<Object>} Updated group
   */
  async addExpenseToGroup(groupId, userId, expenseId) {
    try {
      const group = await Group.findById(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      if (!group.isMember(userId)) {
        throw new Error('Access denied');
      }

      // Verify expense exists and belongs to user
      const expense = await Expense.findOne({ _id: expenseId, user: userId });
      if (!expense) {
        throw new Error('Expense not found or access denied');
      }

      // Add expense to group
      group.addExpense(expenseId, userId);
      await group.save();

      // Populate and return
      await group.populate('expenses.expense', 'description amount category date');
      await group.populate('expenses.addedBy', 'name email');

      // Send notifications to other members
      const otherMembers = group.members.filter(m =>
        m.isActive && m.user.toString() !== userId.toString()
      );

      for (const member of otherMembers) {
        await notificationService.sendNotification(member.user, {
          title: 'New Group Expense',
          message: `${expense.description} (₹${expense.amount}) added to "${group.name}"`,
          type: 'group_expense',
          priority: 'medium',
          data: {
            groupId: group._id,
            expenseId: expense._id,
            amount: expense.amount
          }
        });
      }

      return group;
    } catch (error) {
      console.error('Add expense to group error:', error);
      throw error;
    }
  }

  /**
   * Update group settings
   * @param {string} groupId - Group ID
   * @param {string} userId - User ID (must be admin)
   * @param {Object} settings - New settings
   * @returns {Promise<Object>} Updated group
   */
  async updateGroupSettings(groupId, userId, settings) {
    try {
      const group = await Group.findById(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      if (!group.isAdmin(userId)) {
        throw new Error('Access denied');
      }

      // Update settings
      group.settings = { ...group.settings, ...settings };
      await group.save();

      return group;
    } catch (error) {
      console.error('Update group settings error:', error);
      throw error;
    }
  }

  /**
   * Delete group
   * @param {string} groupId - Group ID
   * @param {string} userId - User ID (must be creator)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteGroup(groupId, userId) {
    try {
      const group = await Group.findById(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      if (group.createdBy.toString() !== userId.toString()) {
        throw new Error('Access denied');
      }

      // Soft delete by setting isActive to false
      group.isActive = false;
      await group.save();

      // Send notifications to members
      for (const member of group.members.filter(m => m.isActive)) {
        await notificationService.sendNotification(member.user, {
          title: 'Group Deleted',
          message: `The group "${group.name}" has been deleted`,
          type: 'group_deleted',
          priority: 'high',
          data: {
            groupId: group._id,
            groupName: group.name
          }
        });
      }

      return { message: 'Group deleted successfully' };
    } catch (error) {
      console.error('Delete group error:', error);
      throw error;
    }
  }

  /**
   * Get group statistics
   * @param {string} groupId - Group ID
   * @param {string} userId - User ID (must be member)
   * @returns {Promise<Object>} Group statistics
   */
  async getGroupStatistics(groupId, userId) {
    try {
      const group = await Group.findById(groupId)
        .populate('expenses.expense', 'amount category date')
        .populate('members.user', 'name email');

      if (!group) {
        throw new Error('Group not found');
      }

      if (!group.isMember(userId)) {
        throw new Error('Access denied');
      }

      const activeMembers = group.members.filter(m => m.isActive);
      const totalExpenses = group.expenses.length;
      const totalAmount = group.expenses.reduce((sum, exp) => sum + (exp.expense?.amount || 0), 0);

      // Category breakdown
      const categoryBreakdown = {};
      group.expenses.forEach(exp => {
        const category = exp.expense?.category || 'other';
        categoryBreakdown[category] = (categoryBreakdown[category] || 0) + (exp.expense?.amount || 0);
      });

      // Monthly spending trend (last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const monthlySpending = {};
      group.expenses.forEach(exp => {
        if (exp.expense?.date >= sixMonthsAgo) {
          const monthKey = exp.expense.date.toISOString().substring(0, 7); // YYYY-MM
          monthlySpending[monthKey] = (monthlySpending[monthKey] || 0) + (exp.expense?.amount || 0);
        }
      });

      return {
        groupId: group._id,
        groupName: group.name,
        memberCount: activeMembers.length,
        totalExpenses,
        totalAmount,
        currency: group.currency,
        categoryBreakdown,
        monthlySpending,
        createdAt: group.createdAt,
        lastActivity: group.expenses.length > 0 ?
          Math.max(...group.expenses.map(e => e.addedAt)) : group.createdAt
      };
    } catch (error) {
      console.error('Get group statistics error:', error);
      throw error;
    }
  }
}

module.exports = new GroupService();
