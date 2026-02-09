const ExpenseSplit = require('../models/ExpenseSplit');
const Expense = require('../models/Expense');
const Group = require('../models/Group');
const User = require('../models/User');
const notificationService = require('./notificationService');

class SplitService {
  /**
   * Create a new expense split
   * @param {string} expenseId - Expense ID
   * @param {string} groupId - Group ID
   * @param {string} createdBy - User ID who created the split
   * @param {Object} splitData - Split configuration
   * @returns {Promise<Object>} Created split
   */
  async createSplit(expenseId, groupId, createdBy, splitData) {
    try {
      // Verify expense exists and belongs to user
      const expense = await Expense.findOne({ _id: expenseId, user: createdBy });
      if (!expense) {
        throw new Error('Expense not found or access denied');
      }

      // Verify group exists and user is member
      const group = await Group.findById(groupId);
      if (!group || !group.isMember(createdBy)) {
        throw new Error('Group not found or access denied');
      }

      // Get active group members
      const activeMembers = group.members.filter(m => m.isActive && m.user.toString() !== createdBy.toString());
      if (activeMembers.length === 0) {
        throw new Error('No other active members in the group to split with');
      }

      // Prepare participants based on split method
      const participants = [];

      if (splitData.splitMethod === 'equal') {
        // Equal split among all active members including creator
        const totalParticipants = activeMembers.length + 1; // +1 for creator
        const equalAmount = expense.amount / totalParticipants;

        // Add creator
        participants.push({
          user: createdBy,
          amount: equalAmount,
          isPaid: true, // Creator has already paid
          paidAt: new Date()
        });

        // Add other members
        activeMembers.forEach(member => {
          participants.push({
            user: member.user,
            amount: equalAmount,
            isPaid: false
          });
        });
      } else if (splitData.splitMethod === 'custom') {
        // Custom split with specified amounts
        if (!splitData.participants || !Array.isArray(splitData.participants)) {
          throw new Error('Participants array required for custom split');
        }

        // Validate participants are group members
        for (const participant of splitData.participants) {
          const isMember = group.members.some(m =>
            m.user.toString() === participant.user.toString() && m.isActive
          );
          if (!isMember) {
            throw new Error('All participants must be active group members');
          }
        }

        participants.push(...splitData.participants);
      }

      // Create the split
      const split = new ExpenseSplit({
        expense: expenseId,
        group: groupId,
        splitMethod: splitData.splitMethod,
        participants: participants,
        totalAmount: expense.amount,
        currency: expense.currency || 'USD',
        createdBy: createdBy,
        notes: splitData.notes
      });

      await split.save();

      // Populate the result
      await split.populate([
        { path: 'expense', select: 'description amount category type date' },
        { path: 'group', select: 'name' },
        { path: 'participants.user', select: 'name email' },
        { path: 'createdBy', select: 'name' }
      ]);

      // Send notifications to participants
      await this.notifySplitCreated(split);

      return split;
    } catch (error) {
      console.error('Create split error:', error);
      throw error;
    }
  }

  /**
   * Mark a participant as paid
   * @param {string} splitId - Split ID
   * @param {string} userId - User ID marking payment
   * @returns {Promise<Object>} Updated split
   */
  async markAsPaid(splitId, userId) {
    try {
      const split = await ExpenseSplit.findById(splitId);
      if (!split) {
        throw new Error('Split not found');
      }

      // Verify user is a participant
      const participant = split.participants.find(p =>
        p.user.toString() === userId.toString()
      );
      if (!participant) {
        throw new Error('User is not a participant in this split');
      }

      if (participant.isPaid) {
        throw new Error('Already marked as paid');
      }

      // Mark as paid
      await split.markAsPaid(userId);

      // Populate and return
      await split.populate([
        { path: 'expense', select: 'description amount category type date' },
        { path: 'group', select: 'name' },
        { path: 'participants.user', select: 'name email' },
        { path: 'createdBy', select: 'name' }
      ]);

      // Send notification
      await this.notifyPaymentReceived(split, userId);

      return split;
    } catch (error) {
      console.error('Mark as paid error:', error);
      throw error;
    }
  }

  /**
   * Get user's pending splits
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of pending splits
   */
  async getUserPendingSplits(userId) {
    try {
      return await ExpenseSplit.findUserPendingSplits(userId);
    } catch (error) {
      console.error('Get user pending splits error:', error);
      throw error;
    }
  }

  /**
   * Get splits for an expense
   * @param {string} expenseId - Expense ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Array>} Array of splits
   */
  async getSplitsForExpense(expenseId, userId) {
    try {
      // Verify user owns the expense
      const expense = await Expense.findOne({ _id: expenseId, user: userId });
      if (!expense) {
        throw new Error('Expense not found or access denied');
      }

      return await ExpenseSplit.findByExpense(expenseId);
    } catch (error) {
      console.error('Get splits for expense error:', error);
      throw error;
    }
  }

  /**
   * Get split by ID
   * @param {string} splitId - Split ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} Split object
   */
  async getSplitById(splitId, userId) {
    try {
      const split = await ExpenseSplit.findById(splitId)
        .populate('expense', 'description amount category type date')
        .populate('group', 'name members')
        .populate('participants.user', 'name email')
        .populate('createdBy', 'name');

      if (!split) {
        throw new Error('Split not found');
      }

      // Check if user is participant or creator
      const isParticipant = split.participants.some(p =>
        p.user._id.toString() === userId.toString()
      );
      const isCreator = split.createdBy._id.toString() === userId.toString();

      if (!isParticipant && !isCreator) {
        throw new Error('Access denied');
      }

      return split;
    } catch (error) {
      console.error('Get split by ID error:', error);
      throw error;
    }
  }

  /**
   * Send reminder for unpaid split
   * @param {string} splitId - Split ID
   * @param {string} userId - User ID sending reminder
   * @param {string} participantId - Participant to remind
   * @returns {Promise<Object>} Updated split
   */
  async sendReminder(splitId, userId, participantId) {
    try {
      const split = await ExpenseSplit.findById(splitId);
      if (!split) {
        throw new Error('Split not found');
      }

      // Verify sender is creator or participant
      const isCreator = split.createdBy.toString() === userId.toString();
      const isParticipant = split.participants.some(p =>
        p.user.toString() === userId.toString()
      );

      if (!isCreator && !isParticipant) {
        throw new Error('Access denied');
      }

      // Verify target is a participant and not paid
      const targetParticipant = split.participants.find(p =>
        p.user.toString() === participantId.toString() && !p.isPaid
      );

      if (!targetParticipant) {
        throw new Error('Invalid participant or already paid');
      }

      // Add reminder record
      await split.addReminder(participantId, 'email');

      // Send notification
      await notificationService.sendNotification(participantId, {
        title: 'Payment Reminder',
        message: `Reminder: You owe ₹${targetParticipant.amount} for "${split.expense.description}"`,
        type: 'expense_reminder',
        priority: 'medium',
        data: {
          splitId: split._id,
          expenseId: split.expense,
          amount: targetParticipant.amount
        }
      });

      return split;
    } catch (error) {
      console.error('Send reminder error:', error);
      throw error;
    }
  }

  /**
   * Get split statistics for user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Statistics object
   */
  async getUserSplitStatistics(userId) {
    try {
      const splits = await ExpenseSplit.find({
        $or: [
          { createdBy: userId },
          { 'participants.user': userId }
        ]
      }).populate('participants.user', 'name');

      const stats = {
        totalSplits: splits.length,
        pendingPayments: 0,
        completedPayments: 0,
        totalOwed: 0,
        totalOwedTo: 0,
        pendingSplits: []
      };

      splits.forEach(split => {
        const userParticipant = split.participants.find(p =>
          p.user._id.toString() === userId.toString()
        );

        if (userParticipant) {
          if (userParticipant.isPaid) {
            stats.completedPayments++;
          } else {
            stats.pendingPayments++;
            stats.totalOwed += userParticipant.amount;
            stats.pendingSplits.push({
              splitId: split._id,
              expense: split.expense.description,
              amount: userParticipant.amount,
              group: split.group.name
            });
          }
        }

        // Calculate amount owed to user (if creator)
        if (split.createdBy.toString() === userId.toString()) {
          const unpaidAmount = split.participants
            .filter(p => !p.isPaid && p.user.toString() !== userId.toString())
            .reduce((sum, p) => sum + p.amount, 0);
          stats.totalOwedTo += unpaidAmount;
        }
      });

      return stats;
    } catch (error) {
      console.error('Get user split statistics error:', error);
      throw error;
    }
  }

  /**
   * Notify participants when split is created
   * @param {Object} split - Split object
   */
  async notifySplitCreated(split) {
    try {
      const unpaidParticipants = split.participants.filter(p => !p.isPaid);

      for (const participant of unpaidParticipants) {
        await notificationService.sendNotification(participant.user._id || participant.user, {
          title: 'New Expense Split',
          message: `You owe ₹${participant.amount} for "${split.expense.description}"`,
          type: 'expense_split',
          priority: 'medium',
          data: {
            splitId: split._id,
            expenseId: split.expense._id || split.expense,
            amount: participant.amount
          }
        });
      }
    } catch (error) {
      console.error('Notify split created error:', error);
    }
  }

  /**
   * Notify when payment is received
   * @param {Object} split - Split object
   * @param {string} paidBy - User who paid
   */
  async notifyPaymentReceived(split, paidBy) {
    try {
      // Notify the creator
      if (split.createdBy._id.toString() !== paidBy.toString()) {
        await notificationService.sendNotification(split.createdBy, {
          title: 'Payment Received',
          message: `Payment received for "${split.expense.description}"`,
          type: 'payment_received',
          priority: 'low',
          data: {
            splitId: split._id,
            expenseId: split.expense._id || split.expense,
            paidBy: paidBy
          }
        });
      }

      // Check if split is now complete
      if (split.status === 'completed') {
        // Notify all participants that split is complete
        for (const participant of split.participants) {
          await notificationService.sendNotification(participant.user._id || participant.user, {
            title: 'Split Completed',
            message: `All payments received for "${split.expense.description}"`,
            type: 'split_completed',
            priority: 'low',
            data: {
              splitId: split._id,
              expenseId: split.expense._id || split.expense
            }
          });
        }
      }
    } catch (error) {
      console.error('Notify payment received error:', error);
    }
  }
}

module.exports = new SplitService();
