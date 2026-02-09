/**
 * Account Model
 * Issue #337: Multi-Account Liquidity Management
 * Manages multiple financial accounts (Cash, Bank, Savings, Credit Card, etc.)
 */

const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Account Identification
  name: {
    type: String,
    required: [true, 'Account name is required'],
    trim: true,
    maxlength: [100, 'Account name cannot exceed 100 characters']
  },
  
  type: {
    type: String,
    required: true,
    enum: {
      values: ['cash', 'checking', 'savings', 'credit_card', 'investment', 'loan', 'wallet', 'crypto', 'other'],
      message: 'Invalid account type'
    }
  },
  
  subtype: {
    type: String,
    enum: ['personal', 'business', 'joint', 'emergency_fund', 'retirement', 'brokerage', 'defi', 'exchange'],
    default: 'personal'
  },
  
  // Financial Details
  currency: {
    type: String,
    required: true,
    uppercase: true,
    default: 'USD',
    minlength: 3,
    maxlength: 5 // Support for crypto codes like "USDT"
  },
  
  balance: {
    type: Number,
    required: true,
    default: 0
  },
  
  // For credit cards and loans (negative balance accounts)
  creditLimit: {
    type: Number,
    default: null
  },
  
  availableCredit: {
    type: Number,
    default: null
  },
  
  interestRate: {
    type: Number, // APR as percentage
    min: 0,
    max: 100,
    default: null
  },
  
  // Institution Details
  institution: {
    name: { type: String, trim: true },
    logo: { type: String }, // URL to logo
    color: { type: String, default: '#667eea' } // Brand color for UI
  },
  
  accountNumber: {
    type: String,
    trim: true,
    select: false // Hide by default for security
  },
  
  // Last 4 digits for display
  accountNumberMasked: {
    type: String,
    maxlength: 4
  },
  
  // Status & Visibility
  isActive: {
    type: Boolean,
    default: true
  },
  
  isHidden: {
    type: Boolean,
    default: false
  },
  
  includeInNetWorth: {
    type: Boolean,
    default: true
  },
  
  includeInBudget: {
    type: Boolean,
    default: true
  },
  
  // Sorting and Organization
  sortOrder: {
    type: Number,
    default: 0
  },
  
  group: {
    type: String,
    trim: true,
    default: null // For custom grouping like "Main Accounts", "Investments"
  },
  
  icon: {
    type: String,
    default: 'fa-wallet'
  },
  
  color: {
    type: String,
    default: '#667eea'
  },
  
  // Balance Tracking
  lastBalanceUpdate: {
    type: Date,
    default: Date.now
  },
  
  balanceUpdateMethod: {
    type: String,
    enum: ['manual', 'calculated', 'synced', 'api'],
    default: 'manual'
  },
  
  // Opening balance for reconciliation
  openingBalance: {
    type: Number,
    default: 0
  },
  
  openingDate: {
    type: Date,
    default: Date.now
  },
  
  // Metadata
  notes: {
    type: String,
    maxlength: 500
  },
  
  tags: [{
    type: String,
    trim: true
  }],
  
  // External Connections
  linkedBankConnectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankConnection',
    default: null
  },
  
  externalId: {
    type: String, // ID from external APIs (Plaid, etc.)
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
accountSchema.index({ userId: 1, isActive: 1 });
accountSchema.index({ userId: 1, type: 1 });
accountSchema.index({ userId: 1, currency: 1 });
accountSchema.index({ userId: 1, sortOrder: 1 });
accountSchema.index({ userId: 1, includeInNetWorth: 1 });

// Virtual for effective balance (considering credit)
accountSchema.virtual('effectiveBalance').get(function() {
  if (this.type === 'credit_card' || this.type === 'loan') {
    return -Math.abs(this.balance); // Credit cards show as negative
  }
  return this.balance;
});

// Virtual to check if account is in debt
accountSchema.virtual('isInDebt').get(function() {
  if (this.type === 'credit_card' || this.type === 'loan') {
    return this.balance > 0;
  }
  return this.balance < 0;
});

// Virtual for credit utilization
accountSchema.virtual('creditUtilization').get(function() {
  if (this.creditLimit && this.creditLimit > 0) {
    return (this.balance / this.creditLimit) * 100;
  }
  return null;
});

// Pre-save middleware
accountSchema.pre('save', function(next) {
  // Update masked account number
  if (this.accountNumber && this.isModified('accountNumber')) {
    this.accountNumberMasked = this.accountNumber.slice(-4);
  }
  
  // Update available credit for credit cards
  if (this.type === 'credit_card' && this.creditLimit) {
    this.availableCredit = this.creditLimit - this.balance;
  }
  
  // Update last balance update time if balance changed
  if (this.isModified('balance')) {
    this.lastBalanceUpdate = new Date();
  }
  
  next();
});

// Static methods
accountSchema.statics.getUserAccounts = async function(userId, options = {}) {
  const query = { userId, isActive: true };
  
  if (options.type) query.type = options.type;
  if (options.includeHidden !== true) query.isHidden = false;
  if (options.currency) query.currency = options.currency;
  
  return this.find(query)
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
};

accountSchema.statics.getNetWorthAccounts = async function(userId) {
  return this.find({
    userId,
    isActive: true,
    includeInNetWorth: true
  }).lean();
};

accountSchema.statics.getTotalBalance = async function(userId, currency = null) {
  const match = {
    userId: new mongoose.Types.ObjectId(userId),
    isActive: true,
    includeInNetWorth: true
  };
  
  if (currency) match.currency = currency;
  
  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$currency',
        total: {
          $sum: {
            $cond: [
              { $in: ['$type', ['credit_card', 'loan']] },
              { $multiply: ['$balance', -1] },
              '$balance'
            ]
          }
        },
        count: { $sum: 1 }
      }
    }
  ]);
  
  return result;
};

accountSchema.statics.getAccountsByType = async function(userId) {
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        isActive: true
      }
    },
    {
      $group: {
        _id: '$type',
        accounts: { $push: '$$ROOT' },
        totalBalance: { $sum: '$balance' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
};

// Instance methods
accountSchema.methods.updateBalance = async function(amount, description = '') {
  const BalanceHistory = mongoose.model('BalanceHistory');
  
  const previousBalance = this.balance;
  this.balance = amount;
  this.lastBalanceUpdate = new Date();
  this.balanceUpdateMethod = 'manual';
  
  await this.save();
  
  // Record balance change in history
  await BalanceHistory.create({
    accountId: this._id,
    userId: this.userId,
    previousBalance,
    newBalance: amount,
    change: amount - previousBalance,
    changeType: 'adjustment',
    description,
    currency: this.currency
  });
  
  return this;
};

accountSchema.methods.adjustBalance = async function(adjustment, description = '', type = 'adjustment') {
  const BalanceHistory = mongoose.model('BalanceHistory');
  
  const previousBalance = this.balance;
  this.balance += adjustment;
  this.lastBalanceUpdate = new Date();
  
  await this.save();
  
  await BalanceHistory.create({
    accountId: this._id,
    userId: this.userId,
    previousBalance,
    newBalance: this.balance,
    change: adjustment,
    changeType: type,
    description,
    currency: this.currency
  });
  
  return this;
};

accountSchema.methods.getBalanceHistory = async function(days = 30) {
  const BalanceHistory = mongoose.model('BalanceHistory');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return BalanceHistory.find({
    accountId: this._id,
    createdAt: { $gte: startDate }
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Account', accountSchema);
