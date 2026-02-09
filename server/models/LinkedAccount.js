const mongoose = require('mongoose');

const linkedAccountSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  bankConnection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankConnection',
    required: true
  },
  
  // Account identifiers
  accountId: {
    type: String,
    required: true
  },
  
  // Masked account number for display
  mask: String,
  
  // Account details
  name: {
    type: String,
    required: true
  },
  
  officialName: String,
  
  type: {
    type: String,
    enum: ['checking', 'savings', 'credit', 'loan', 'investment', 'mortgage', 'brokerage', 'other'],
    required: true
  },
  
  subtype: {
    type: String,
    enum: [
      // Checking subtypes
      'checking', 'money_market',
      // Savings subtypes
      'savings', 'cd', 'hsa',
      // Credit subtypes
      'credit_card', 'paypal',
      // Loan subtypes
      'auto', 'business', 'commercial', 'construction', 'consumer', 
      'home_equity', 'line_of_credit', 'personal', 'student',
      // Investment subtypes
      '401a', '401k', '403b', '457b', '529', 'brokerage', 'ira', 
      'roth', 'roth_401k', 'stock_plan', 'trust',
      // Mortgage subtypes
      'mortgage',
      'other'
    ]
  },
  
  // Balance information
  balances: {
    current: {
      type: Number,
      default: 0
    },
    available: Number,
    limit: Number, // For credit accounts
    isoCurrencyCode: {
      type: String,
      default: 'USD'
    },
    lastUpdated: Date
  },
  
  // Historical balance tracking
  balanceHistory: [{
    date: Date,
    current: Number,
    available: Number
  }],
  
  // Account status
  status: {
    type: String,
    enum: ['active', 'inactive', 'closed', 'error'],
    default: 'active'
  },
  
  // User preferences
  preferences: {
    includeInNetWorth: {
      type: Boolean,
      default: true
    },
    includeInBudget: {
      type: Boolean,
      default: true
    },
    autoImportTransactions: {
      type: Boolean,
      default: true
    },
    defaultCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxCategory'
    },
    nickname: String,
    color: String,
    icon: String
  },
  
  // Sync tracking
  sync: {
    lastTransactionSync: Date,
    lastBalanceSync: Date,
    transactionCursor: String,
    oldestSyncedDate: Date,
    newestSyncedDate: Date
  },
  
  // Reconciliation
  reconciliation: {
    isReconciled: {
      type: Boolean,
      default: false
    },
    lastReconciledAt: Date,
    reconciledBalance: Number,
    pendingReview: {
      type: Number,
      default: 0
    }
  },
  
  // Institution-specific metadata
  institutionData: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  
  // Verification status (for payment accounts)
  verification: {
    status: {
      type: String,
      enum: ['pending', 'verified', 'failed', 'not_required'],
      default: 'not_required'
    },
    method: String,
    verifiedAt: Date
  }
}, {
  timestamps: true
});

// Compound indexes
linkedAccountSchema.index({ user: 1, bankConnection: 1 });
linkedAccountSchema.index({ user: 1, type: 1 });
linkedAccountSchema.index({ accountId: 1, bankConnection: 1 }, { unique: true });
linkedAccountSchema.index({ 'balances.lastUpdated': 1 });

// Virtual for display balance (considers account type)
linkedAccountSchema.virtual('displayBalance').get(function() {
  if (['credit', 'loan', 'mortgage'].includes(this.type)) {
    return -Math.abs(this.balances.current);
  }
  return this.balances.current;
});

// Virtual for utilization (credit accounts)
linkedAccountSchema.virtual('utilization').get(function() {
  if (this.type === 'credit' && this.balances.limit) {
    return (this.balances.current / this.balances.limit) * 100;
  }
  return null;
});

// Update balance with history tracking
linkedAccountSchema.methods.updateBalance = function(current, available, limit) {
  // Add to history if date changed
  const today = new Date().toDateString();
  const lastUpdate = this.balances.lastUpdated ? 
    new Date(this.balances.lastUpdated).toDateString() : null;
  
  if (lastUpdate !== today && this.balances.current !== undefined) {
    this.balanceHistory.push({
      date: this.balances.lastUpdated || new Date(),
      current: this.balances.current,
      available: this.balances.available
    });
    
    // Keep only last 365 days of history
    if (this.balanceHistory.length > 365) {
      this.balanceHistory = this.balanceHistory.slice(-365);
    }
  }
  
  this.balances.current = current;
  if (available !== undefined) this.balances.available = available;
  if (limit !== undefined) this.balances.limit = limit;
  this.balances.lastUpdated = new Date();
};

// Get balance trend
linkedAccountSchema.methods.getBalanceTrend = function(days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  const history = this.balanceHistory.filter(h => new Date(h.date) >= cutoff);
  
  if (history.length < 2) return { trend: 'stable', change: 0 };
  
  const firstBalance = history[0].current;
  const lastBalance = this.balances.current;
  const change = lastBalance - firstBalance;
  const percentChange = firstBalance !== 0 ? (change / Math.abs(firstBalance)) * 100 : 0;
  
  return {
    trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
    change,
    percentChange: Math.round(percentChange * 100) / 100,
    history: history.map(h => ({ date: h.date, balance: h.current }))
  };
};

// Check if account needs attention
linkedAccountSchema.methods.needsAttention = function() {
  const issues = [];
  
  if (this.status === 'error') {
    issues.push('Account has an error');
  }
  
  if (this.type === 'credit' && this.utilization > 80) {
    issues.push('High credit utilization');
  }
  
  if (this.reconciliation.pendingReview > 0) {
    issues.push(`${this.reconciliation.pendingReview} transactions need review`);
  }
  
  const daysSinceSync = this.sync.lastTransactionSync ? 
    (new Date() - new Date(this.sync.lastTransactionSync)) / (1000 * 60 * 60 * 24) : 999;
  
  if (daysSinceSync > 7) {
    issues.push('Account not synced recently');
  }
  
  return issues;
};

// Static: Get user's total balances by type
linkedAccountSchema.statics.getUserBalancesByType = async function(userId) {
  const accounts = await this.find({ 
    user: userId, 
    status: 'active',
    'preferences.includeInNetWorth': true 
  });
  
  const byType = {};
  let netWorth = 0;
  
  accounts.forEach(account => {
    const type = account.type;
    if (!byType[type]) {
      byType[type] = { total: 0, accounts: 0, currency: account.balances.isoCurrencyCode };
    }
    
    byType[type].total += account.displayBalance;
    byType[type].accounts += 1;
    
    // Assets add, liabilities subtract
    if (['credit', 'loan', 'mortgage'].includes(type)) {
      netWorth -= Math.abs(account.balances.current);
    } else {
      netWorth += account.balances.current;
    }
  });
  
  return { byType, netWorth, accountCount: accounts.length };
};

// Static: Find accounts needing balance refresh
linkedAccountSchema.statics.findNeedingBalanceRefresh = function(olderThanHours = 24) {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - olderThanHours);
  
  return this.find({
    status: 'active',
    $or: [
      { 'balances.lastUpdated': { $lt: cutoff } },
      { 'balances.lastUpdated': { $exists: false } }
    ]
  }).populate('bankConnection');
};

// Static: Get accounts summary for dashboard
linkedAccountSchema.statics.getDashboardSummary = async function(userId) {
  const accounts = await this.find({ user: userId, status: 'active' })
    .populate('bankConnection', 'institution status');
  
  const summary = {
    totalAccounts: accounts.length,
    totalAssets: 0,
    totalLiabilities: 0,
    netWorth: 0,
    byType: {},
    byInstitution: {},
    needsAttention: []
  };
  
  accounts.forEach(account => {
    const balance = account.balances.current || 0;
    const type = account.type;
    const institution = account.bankConnection?.institution?.name || 'Unknown';
    
    // Categorize
    if (['credit', 'loan', 'mortgage'].includes(type)) {
      summary.totalLiabilities += Math.abs(balance);
    } else {
      summary.totalAssets += balance;
    }
    
    // By type
    if (!summary.byType[type]) {
      summary.byType[type] = { count: 0, balance: 0 };
    }
    summary.byType[type].count += 1;
    summary.byType[type].balance += balance;
    
    // By institution
    if (!summary.byInstitution[institution]) {
      summary.byInstitution[institution] = { count: 0, balance: 0 };
    }
    summary.byInstitution[institution].count += 1;
    summary.byInstitution[institution].balance += balance;
    
    // Check for issues
    const issues = account.needsAttention();
    if (issues.length > 0) {
      summary.needsAttention.push({
        accountId: account._id,
        name: account.preferences.nickname || account.name,
        issues
      });
    }
  });
  
  summary.netWorth = summary.totalAssets - summary.totalLiabilities;
  
  return summary;
};

module.exports = mongoose.model('LinkedAccount', linkedAccountSchema);
