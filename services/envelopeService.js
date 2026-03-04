const Envelope = require('../models/Envelope');
const Expense = require('../models/Expense');
const logger = require('../utils/logger');

class EnvelopeService {
  /**
   * Create a new envelope
   * @param {string} userId - User ID
   * @param {Object} envelopeData - Envelope data
   * @returns {Promise<Object>} Created envelope
   */
  async createEnvelope(userId, envelopeData) {
    try {
      logger.info(`Creating envelope for user ${userId}: ${envelopeData.name}`);

      const envelope = new Envelope({
        ...envelopeData,
        user: userId
      });

      await envelope.save();
      logger.info(`Envelope created successfully: ${envelope._id}`);
      return envelope;
    } catch (error) {
      logger.error(`Error creating envelope for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get all envelopes for a user
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of envelopes
   */
  async getEnvelopes(userId, filters = {}) {
    try {
      logger.info(`Getting envelopes for user ${userId}`);

      const query = { user: userId, isArchived: false };

      if (filters.period) {
        query.period = filters.period;
      }

      if (filters.category) {
        query.category = filters.category;
      }

      if (filters.isActive !== undefined) {
        query.isActive = filters.isActive;
      }

      const envelopes = await Envelope.find(query).sort({ createdAt: -1 });
      
      // Calculate current spent amounts for each envelope
      for (const envelope of envelopes) {
        await this.calculateEnvelopeSpent(envelope);
      }

      return envelopes;
    } catch (error) {
      logger.error(`Error getting envelopes for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get envelope by ID
   * @param {string} envelopeId - Envelope ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Envelope object
   */
  async getEnvelopeById(envelopeId, userId) {
    try {
      logger.info(`Getting envelope ${envelopeId} for user ${userId}`);

      const envelope = await Envelope.findOne({ _id: envelopeId, user: userId });

      if (!envelope) {
        throw new Error('Envelope not found');
      }

      // Calculate current spent amount
      await this.calculateEnvelopeSpent(envelope);

      return envelope;
    } catch (error) {
      logger.error(`Error getting envelope ${envelopeId} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update envelope
   * @param {string} envelopeId - Envelope ID
   * @param {string} userId - User ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated envelope
   */
  async updateEnvelope(envelopeId, userId, updates) {
    try {
      logger.info(`Updating envelope ${envelopeId} for user ${userId}`);

      const envelope = await Envelope.findOneAndUpdate(
        { _id: envelopeId, user: userId },
        { $set: updates },
        { new: true, runValidators: true }
      );

      if (!envelope) {
        throw new Error('Envelope not found');
      }

      logger.info(`Envelope ${envelopeId} updated successfully`);
      return envelope;
    } catch (error) {
      logger.error(`Error updating envelope ${envelopeId} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Delete envelope
   * @param {string} envelopeId - Envelope ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteEnvelope(envelopeId, userId) {
    try {
      logger.info(`Deleting envelope ${envelopeId} for user ${userId}`);

      const envelope = await Envelope.findOneAndDelete({ _id: envelopeId, user: userId });

      if (!envelope) {
        throw new Error('Envelope not found');
      }

      logger.info(`Envelope ${envelopeId} deleted successfully`);
      return { message: 'Envelope deleted successfully', envelope };
    } catch (error) {
      logger.error(`Error deleting envelope ${envelopeId} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Allocate money to envelope
   * @param {string} envelopeId - Envelope ID
   * @param {string} userId - User ID
   * @param {number} amount - Amount to allocate
   * @returns {Promise<Object>} Updated envelope
   */
  async allocateToEnvelope(envelopeId, userId, amount) {
    try {
      logger.info(`Allocating ${amount} to envelope ${envelopeId} for user ${userId}`);

      if (amount <= 0) {
        throw new Error('Allocation amount must be positive');
      }

      const envelope = await Envelope.findOne({ _id: envelopeId, user: userId });

      if (!envelope) {
        throw new Error('Envelope not found');
      }

      envelope.allocatedAmount += amount;
      await envelope.save();

      logger.info(`Allocated ${amount} to envelope ${envelopeId} successfully`);
      return envelope;
    } catch (error) {
      logger.error(`Error allocating to envelope ${envelopeId} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Spend from envelope
   * @param {string} envelopeId - Envelope ID
   * @param {string} userId - User ID
   * @param {number} amount - Amount to spend
   * @param {string} expenseId - Related expense ID
   * @returns {Promise<Object>} Updated envelope
   */
  async spendFromEnvelope(envelopeId, userId, amount, expenseId = null) {
    try {
      logger.info(`Spending ${amount} from envelope ${envelopeId} for user ${userId}`);

      if (amount <= 0) {
        throw new Error('Spend amount must be positive');
      }

      const envelope = await Envelope.findOne({ _id: envelopeId, user: userId });

      if (!envelope) {
        throw new Error('Envelope not found');
      }

      const totalAvailable = envelope.allocatedAmount + envelope.rolledOverAmount;
      
      if (envelope.spentAmount + amount > totalAvailable) {
        logger.warn(`Envelope ${envelopeId} overspent: ${envelope.spentAmount + amount} > ${totalAvailable}`);
      }

      envelope.spentAmount += amount;
      await envelope.save();

      logger.info(`Spent ${amount} from envelope ${envelopeId} successfully`);
      return envelope;
    } catch (error) {
      logger.error(`Error spending from envelope ${envelopeId} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Transfer money between envelopes
   * @param {string} fromEnvelopeId - Source envelope ID
   * @param {string} toEnvelopeId - Destination envelope ID
   * @param {string} userId - User ID
   * @param {number} amount - Amount to transfer
   * @returns {Promise<Object>} Transfer result
   */
  async transferBetweenEnvelopes(fromEnvelopeId, toEnvelopeId, userId, amount) {
    try {
      logger.info(`Transferring ${amount} from envelope ${fromEnvelopeId} to ${toEnvelopeId} for user ${userId}`);

      if (amount <= 0) {
        throw new Error('Transfer amount must be positive');
      }

      if (fromEnvelopeId === toEnvelopeId) {
        throw new Error('Cannot transfer to the same envelope');
      }

      const fromEnvelope = await Envelope.findOne({ _id: fromEnvelopeId, user: userId });
      const toEnvelope = await Envelope.findOne({ _id: toEnvelopeId, user: userId });

      if (!fromEnvelope) {
        throw new Error('Source envelope not found');
      }

      if (!toEnvelope) {
        throw new Error('Destination envelope not found');
      }

      const fromAvailable = fromEnvelope.allocatedAmount + fromEnvelope.rolledOverAmount - fromEnvelope.spentAmount;

      if (amount > fromAvailable) {
        throw new Error('Insufficient funds in source envelope');
      }

      // Perform the transfer
      fromEnvelope.allocatedAmount -= amount;
      toEnvelope.allocatedAmount += amount;

      await fromEnvelope.save();
      await toEnvelope.save();

      logger.info(`Transferred ${amount} from envelope ${fromEnvelopeId} to ${toEnvelopeId} successfully`);
      
      return {
        fromEnvelope,
        toEnvelope,
        amount
      };
    } catch (error) {
      logger.error(`Error transferring between envelopes for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Roll over unused funds to next period
   * @param {string} envelopeId - Envelope ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated envelope
   */
  async rollOverEnvelope(envelopeId, userId) {
    try {
      logger.info(`Rolling over envelope ${envelopeId} for user ${userId}`);

      const envelope = await Envelope.findOne({ _id: envelopeId, user: userId });

      if (!envelope) {
        throw new Error('Envelope not found');
      }

      const remaining = envelope.allocatedAmount + envelope.rolledOverAmount - envelope.spentAmount;
      
      if (remaining > 0) {
        envelope.rolledOverAmount = remaining;
      } else {
        envelope.rolledOverAmount = 0;
      }

      // Reset for new period
      envelope.spentAmount = 0;
      envelope.lastResetDate = new Date();
      
      // Calculate new period dates
      const periodDates = this._calculatePeriodDates(envelope.period);
      envelope.startDate = periodDates.startDate;
      envelope.endDate = periodDates.endDate;

      await envelope.save();

      logger.info(`Envelope ${envelopeId} rolled over successfully`);
      return envelope;
    } catch (error) {
      logger.error(`Error rolling over envelope ${envelopeId} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Reset all envelopes for a new period
   * @param {string} userId - User ID
   * @param {string} period - Period type
   * @returns {Promise<Array>} Reset envelopes
   */
  async resetAllEnvelopes(userId, period = null) {
    try {
      logger.info(`Resetting all envelopes for user ${userId}`);

      const query = { user: userId, isArchived: false };
      
      if (period) {
        query.period = period;
      }

      const envelopes = await Envelope.find(query);

      for (const envelope of envelopes) {
        const remaining = envelope.allocatedAmount + envelope.rolledOverAmount - envelope.spentAmount;
        
        if (remaining > 0) {
          envelope.rolledOverAmount = remaining;
        } else {
          envelope.rolledOverAmount = 0;
        }

        envelope.spentAmount = 0;
        envelope.lastResetDate = new Date();

        const periodDates = this._calculatePeriodDates(envelope.period);
        envelope.startDate = periodDates.startDate;
        envelope.endDate = periodDates.endDate;

        await envelope.save();
      }

      logger.info(`Reset ${envelopes.length} envelopes for user ${userId}`);
      return envelopes;
    } catch (error) {
      logger.error(`Error resetting envelopes for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get envelope summary
   * @param {string} userId - User ID
   * @param {string} period - Period type
   * @returns {Promise<Object>} Summary object
   */
  async getEnvelopeSummary(userId, period = 'monthly') {
    try {
      logger.info(`Getting envelope summary for user ${userId}`);

      const envelopes = await Envelope.find({
        user: userId,
        isArchived: false,
        period
      });

      // Calculate current spent amounts
      for (const envelope of envelopes) {
        await this.calculateEnvelopeSpent(envelope);
      }

      const totalAllocated = envelopes.reduce((sum, e) => sum + e.allocatedAmount, 0);
      const totalSpent = envelopes.reduce((sum, e) => sum + e.spentAmount, 0);
      const totalRolledOver = envelopes.reduce((sum, e) => sum + e.rolledOverAmount, 0);
      const totalAvailable = totalAllocated + totalRolledOver;
      const totalRemaining = totalAvailable - totalSpent;

      // Calculate category breakdown
      const categoryBreakdown = {};
      for (const envelope of envelopes) {
        categoryBreakdown[envelope.category] = {
          allocated: envelope.allocatedAmount,
          spent: envelope.spentAmount,
          remaining: envelope.allocatedAmount + envelope.rolledOverAmount - envelope.spentAmount,
          percentage: totalAllocated > 0 ? Math.round((envelope.allocatedAmount / totalAllocated) * 100) : 0
        };
      }

      // Find envelopes that need attention
      const alerts = envelopes
        .filter(e => {
          const totalAvailable = e.allocatedAmount + e.rolledOverAmount;
          const percentage = totalAvailable > 0 ? (e.spentAmount / totalAvailable) * 100 : 0;
          return percentage >= e.alertThreshold;
        })
        .map(e => ({
          envelopeId: e._id,
          name: e.name,
          category: e.category,
          spent: e.spentAmount,
          allocated: e.allocatedAmount,
          percentage: Math.round((e.spentAmount / (e.allocatedAmount + e.rolledOverAmount)) * 100),
          alertThreshold: e.alertThreshold
        }));

      return {
        totalAllocated,
        totalSpent,
        totalRolledOver,
        totalAvailable,
        totalRemaining,
        utilizationPercentage: totalAvailable > 0 ? Math.round((totalSpent / totalAvailable) * 100) : 0,
        envelopeCount: envelopes.length,
        categoryBreakdown,
        alerts
      };
    } catch (error) {
      logger.error(`Error getting envelope summary for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate spent amount for an envelope
   * @param {Object} envelope - Envelope object
   * @returns {Promise<number>} Spent amount
   */
  async calculateEnvelopeSpent(envelope) {
    try {
      const matchConditions = {
        user: envelope.user,
        envelope: envelope._id,
        date: {
          $gte: envelope.startDate,
          $lte: envelope.endDate
        }
      };

      const result = await Expense.aggregate([
        { $match: matchConditions },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const spent = result.length > 0 ? result[0].total : 0;
      
      // Update envelope with calculated spent amount
      if (envelope.spentAmount !== spent) {
        envelope.spentAmount = spent;
        await envelope.save();
      }

      return spent;
    } catch (error) {
      logger.error(`Error calculating spent for envelope ${envelope._id}:`, error);
      return 0;
    }
  }

  /**
   * Get envelope alerts
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of alerts
   */
  async checkEnvelopeAlerts(userId) {
    try {
      logger.info(`Checking envelope alerts for user ${userId}`);

      const envelopes = await Envelope.find({
        user: userId,
        isActive: true,
        isArchived: false,
        endDate: { $gte: new Date() }
      });

      const alerts = [];

      for (const envelope of envelopes) {
        await this.calculateEnvelopeSpent(envelope);

        const totalAvailable = envelope.allocatedAmount + envelope.rolledOverAmount;
        const spentPercentage = totalAvailable > 0 ? (envelope.spentAmount / totalAvailable) * 100 : 0;

        if (spentPercentage >= envelope.alertThreshold) {
          alerts.push({
            envelopeId: envelope._id,
            name: envelope.name,
            category: envelope.category,
            spent: envelope.spentAmount,
            allocated: envelope.allocatedAmount,
            rolledOver: envelope.rolledOverAmount,
            totalAvailable,
            percentage: Math.round(spentPercentage),
            threshold: envelope.alertThreshold,
            remaining: Math.max(0, totalAvailable - envelope.spentAmount),
            period: envelope.period,
            status: spentPercentage > 100 ? 'over' : 'warning'
          });
        }
      }

      logger.info(`Found ${alerts.length} envelope alerts for user ${userId}`);
      return { alerts };
    } catch (error) {
      logger.error(`Error checking envelope alerts for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Archive envelope
   * @param {string} envelopeId - Envelope ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated envelope
   */
  async archiveEnvelope(envelopeId, userId) {
    try {
      logger.info(`Archiving envelope ${envelopeId} for user ${userId}`);

      const envelope = await Envelope.findOneAndUpdate(
        { _id: envelopeId, user: userId },
        { $set: { isArchived: true, isActive: false } },
        { new: true }
      );

      if (!envelope) {
        throw new Error('Envelope not found');
      }

      logger.info(`Envelope ${envelopeId} archived successfully`);
      return envelope;
    } catch (error) {
      logger.error(`Error archiving envelope ${envelopeId} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate period dates
   * @param {string} period - Period type
   * @returns {Object} Start and end dates
   */
  _calculatePeriodDates(period) {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
      case 'weekly':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        startDate.setHours(0, 0, 0, 0);
        
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
        
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
        
      case 'monthly':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
    }

    return { startDate, endDate };
  }
}

module.exports = new EnvelopeService();
