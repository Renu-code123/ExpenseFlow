/**
 * BalanceHistory Model
 * Issue #337: Multi-Account Liquidity Management
 * Tracks historical balance changes for accounts
 */

const mongoose = require('mongoose');

const balanceHistorySchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    index: true
  },
  
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Balance Information
  previousBalance: {
    type: Number,
    required: true
  },
  
  newBalance: {
    type: Number,
    required: true
  },
  
  change: {
    type: Number,
    required: true
  },
  
  currency: {
    type: String,
    required: true,
    uppercase: true,
    default: 'USD'
  },
  
  // Change Classification
  changeType: {
    type: String,
    required: true,
    enum: [
      'expense',           // Regular expense
      'income',            // Regular income
      'transfer_out',      // Transfer to another account
      'transfer_in',       // Transfer from another account
      'adjustment',        // Manual balance adjustment
      'reconciliation',    // Reconciliation adjustment
      'interest',          // Interest earned/charged
      'fee',               // Bank fees
      'refund',            // Refund received
      'dividend',          // Investment dividend
      'revaluation',       // Currency revaluation
      'opening_balance',   // Initial balance
      'sync'               // Synced from external source
    ]
  },
  
  // Related Transaction
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense',
    default: null
  },
  
  // For transfers
  relatedAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    default: null
  },
  
  transferId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transfer',
    default: null
  },
  
  // Description and Notes
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  
  // Exchange Rate (for multi-currency tracking)
  exchangeRate: {
    type: Number,
    default: null
  },
  
  baseCurrencyAmount: {
    type: Number, // Amount in user's base currency
    default: null
  },
  
  // Source of Change
  source: {
    type: String,
    enum: ['manual', 'transaction', 'transfer', 'sync', 'cron', 'api'],
    default: 'manual'
  },
  
  // Running balance for the day (end of day snapshot)
  isEndOfDaySnapshot: {
    type: Boolean,
    default: false
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
balanceHistorySchema.index({ accountId: 1, createdAt: -1 });
balanceHistorySchema.index({ userId: 1, createdAt: -1 });
balanceHistorySchema.index({ userId: 1, changeType: 1, createdAt: -1 });
balanceHistorySchema.index({ accountId: 1, isEndOfDaySnapshot: 1, createdAt: -1 });
balanceHistorySchema.index({ transferId: 1 });

// TTL index - keep history for 2 years
balanceHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 });

// Static methods
balanceHistorySchema.statics.getAccountHistory = async function(accountId, options = {}) {
  const { startDate, endDate, limit = 100, changeType } = options;
  
  const query = { accountId };
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  if (changeType) query.changeType = changeType;
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('relatedAccountId', 'name type')
    .lean();
};

balanceHistorySchema.statics.getDailySnapshots = async function(accountId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  
  return this.aggregate([
    {
      $match: {
        accountId: new mongoose.Types.ObjectId(accountId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $sort: { createdAt: 1 }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        openingBalance: { $first: '$previousBalance' },
        closingBalance: { $last: '$newBalance' },
        totalChange: { $sum: '$change' },
        transactionCount: { $sum: 1 },
        income: {
          $sum: {
            $cond: [{ $gt: ['$change', 0] }, '$change', 0]
          }
        },
        expenses: {
          $sum: {
            $cond: [{ $lt: ['$change', 0] }, { $abs: '$change' }, 0]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

balanceHistorySchema.statics.getUserBalanceTimeline = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $lookup: {
        from: 'accounts',
        localField: 'accountId',
        foreignField: '_id',
        as: 'account'
      }
    },
    { $unwind: '$account' },
    {
      $match: { 'account.includeInNetWorth': true }
      },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          accountId: '$accountId'
        },
        closingBalance: { $last: '$newBalance' },
        currency: { $first: '$currency' },
        accountType: { $first: '$account.type' }
      }
    },
    {
      $group: {
        _id: '$_id.date',
        accounts: {
          $push: {
            accountId: '$_id.accountId',
            balance: '$closingBalance',
            currency: '$currency',
            type: '$accountType'
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

balanceHistorySchema.statics.getTransferHistory = async function(userId, limit = 50) {
  return this.find({
    userId,
    changeType: { $in: ['transfer_in', 'transfer_out'] }
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('accountId', 'name type icon color')
    .populate('relatedAccountId', 'name type icon color')
    .lean();
};

// Create end-of-day snapshot for an account
balanceHistorySchema.statics.createDailySnapshot = async function(account) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  
  // Check if snapshot already exists for today
  const existing = await this.findOne({
    accountId: account._id,
    isEndOfDaySnapshot: true,
    createdAt: { $gte: startOfDay, $lte: today }
  });
  
  if (existing) {
    // Update existing snapshot
    existing.newBalance = account.balance;
    existing.change = account.balance - existing.previousBalance;
    return existing.save();
  }
  
  // Get yesterday's closing balance
  const yesterday = new Date(startOfDay);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const lastSnapshot = await this.findOne({
    accountId: account._id,
    isEndOfDaySnapshot: true,
    createdAt: { $lt: startOfDay }
  }).sort({ createdAt: -1 });
  
  const previousBalance = lastSnapshot ? lastSnapshot.newBalance : account.openingBalance || 0;
  
  return this.create({
    accountId: account._id,
    userId: account.userId,
    previousBalance,
    newBalance: account.balance,
    change: account.balance - previousBalance,
    currency: account.currency,
    changeType: 'reconciliation',
    description: 'Daily balance snapshot',
    isEndOfDaySnapshot: true,
    source: 'cron'
  });
};

module.exports = mongoose.model('BalanceHistory', balanceHistorySchema);
