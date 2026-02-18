/**
 * NetWorthSnapshot Model
 * Issue #337: Multi-Account Liquidity Management & Historical Revaluation
 * Stores daily net worth snapshots with multi-currency support
 */

const mongoose = require('mongoose');

const accountSnapshotSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  name: String,
  type: String,
  balance: Number,
  currency: String,
  balanceInBaseCurrency: Number,
  exchangeRate: Number
}, { _id: false });

const currencyBreakdownSchema = new mongoose.Schema({
  currency: {
    type: String,
    required: true,
    uppercase: true
  },
  totalBalance: Number,
  balanceInBaseCurrency: Number,
  exchangeRate: Number,
  accountCount: Number,
  percentage: Number // Percentage of total net worth
}, { _id: false });

const netWorthSnapshotSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Snapshot Date (normalized to start of day)
  date: {
    type: Date,
    required: true,
    index: true
  },
  
  // Base currency for all calculations
  baseCurrency: {
    type: String,
    required: true,
    uppercase: true,
    default: 'USD'
  },
  
  // Net Worth Summary
  totalNetWorth: {
    type: Number,
    required: true,
    default: 0
  },
  
  totalAssets: {
    type: Number,
    default: 0
  },
  
  totalLiabilities: {
    type: Number,
    default: 0
  },
  
  // Change from previous snapshot
  change: {
    amount: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    previousNetWorth: { type: Number, default: 0 }
  },
  
  // Change from different time periods
  changeFromWeekAgo: {
    amount: { type: Number, default: null },
    percentage: { type: Number, default: null }
  },
  
  changeFromMonthAgo: {
    amount: { type: Number, default: null },
    percentage: { type: Number, default: null }
  },
  
  changeFromYearAgo: {
    amount: { type: Number, default: null },
    percentage: { type: Number, default: null }
  },
  
  // Breakdown by Account Type
  byAccountType: {
    cash: { type: Number, default: 0 },
    checking: { type: Number, default: 0 },
    savings: { type: Number, default: 0 },
    investment: { type: Number, default: 0 },
    crypto: { type: Number, default: 0 },
    credit_card: { type: Number, default: 0 },
    loan: { type: Number, default: 0 },
    wallet: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  },
  
  // Currency Breakdown
  currencyBreakdown: [currencyBreakdownSchema],
  
  // Individual Account Snapshots
  accounts: [accountSnapshotSchema],
  
  // Exchange Rates Used
  exchangeRates: {
    type: Map,
    of: Number,
    default: {}
  },
  
  // Crypto Prices (if applicable)
  cryptoPrices: {
    type: Map,
    of: Number,
    default: {}
  },
  
  // Snapshot Metadata
  isManualSnapshot: {
    type: Boolean,
    default: false
  },
  
  snapshotSource: {
    type: String,
    enum: ['cron', 'manual', 'api', 'revaluation'],
    default: 'cron'
  },
  
  // Data Quality Indicators
  dataQuality: {
    completeAccounts: { type: Number, default: 0 },
    totalAccounts: { type: Number, default: 0 },
    missingRates: [String], // Currencies without exchange rates
    staleAccounts: [mongoose.Schema.Types.ObjectId] // Accounts not updated recently
  },
  
  notes: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Compound indexes
netWorthSnapshotSchema.index({ userId: 1, date: -1 });
netWorthSnapshotSchema.index({ userId: 1, baseCurrency: 1, date: -1 });

// Unique constraint - one snapshot per user per day
netWorthSnapshotSchema.index(
  { userId: 1, date: 1, baseCurrency: 1 },
  { unique: true }
);

// TTL index - keep snapshots for 5 years
netWorthSnapshotSchema.index({ createdAt: 1 }, { expireAfterSeconds: 157680000 });

// Static Methods
netWorthSnapshotSchema.statics.getLatestSnapshot = async function(userId, baseCurrency = 'USD') {
  return this.findOne({ userId, baseCurrency })
    .sort({ date: -1 })
    .lean();
};

netWorthSnapshotSchema.statics.getSnapshotForDate = async function(userId, date, baseCurrency = 'USD') {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  
  return this.findOne({
    userId,
    baseCurrency,
    date: targetDate
  }).lean();
};

netWorthSnapshotSchema.statics.getNetWorthTrend = async function(userId, options = {}) {
  const { days = 30, baseCurrency = 'USD', interval = 'daily' } = options;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  
  let groupBy;
  if (interval === 'weekly') {
    groupBy = { $week: '$date' };
  } else if (interval === 'monthly') {
    groupBy = { $month: '$date' };
  } else {
    groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$date' } };
  }
  
  const pipeline = [
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        baseCurrency,
        date: { $gte: startDate }
      }
    },
    { $sort: { date: 1 } }
  ];
  
  if (interval !== 'daily') {
    pipeline.push({
      $group: {
        _id: groupBy,
        date: { $last: '$date' },
        netWorth: { $last: '$totalNetWorth' },
        assets: { $last: '$totalAssets' },
        liabilities: { $last: '$totalLiabilities' }
      }
    });
    pipeline.push({ $sort: { date: 1 } });
  } else {
    pipeline.push({
      $project: {
        date: 1,
        netWorth: '$totalNetWorth',
        assets: '$totalAssets',
        liabilities: '$totalLiabilities',
        byAccountType: 1
      }
    });
  }
  
  return this.aggregate(pipeline);
};

netWorthSnapshotSchema.statics.getNetWorthStats = async function(userId, baseCurrency = 'USD') {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  
  const [latest, weekSnapshot, monthSnapshot, yearSnapshot, allTime] = await Promise.all([
    this.getLatestSnapshot(userId, baseCurrency),
    this.findOne({ userId, baseCurrency, date: { $lte: weekAgo } }).sort({ date: -1 }).lean(),
    this.findOne({ userId, baseCurrency, date: { $lte: monthAgo } }).sort({ date: -1 }).lean(),
    this.findOne({ userId, baseCurrency, date: { $lte: yearAgo } }).sort({ date: -1 }).lean(),
    this.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), baseCurrency } },
      {
        $group: {
          _id: null,
          allTimeHigh: { $max: '$totalNetWorth' },
          allTimeLow: { $min: '$totalNetWorth' },
          avgNetWorth: { $avg: '$totalNetWorth' },
          snapshotCount: { $sum: 1 },
          firstSnapshot: { $min: '$date' }
        }
      }
    ])
  ]);
  
  const currentNetWorth = latest?.totalNetWorth || 0;
  
  const calculateChange = (oldValue) => {
    if (!oldValue || oldValue === 0) return { amount: null, percentage: null };
    const amount = currentNetWorth - oldValue;
    const percentage = (amount / Math.abs(oldValue)) * 100;
    return { amount, percentage };
  };
  
  return {
    current: currentNetWorth,
    assets: latest?.totalAssets || 0,
    liabilities: latest?.totalLiabilities || 0,
    byAccountType: latest?.byAccountType || {},
    currencyBreakdown: latest?.currencyBreakdown || [],
    changes: {
      daily: latest?.change || { amount: 0, percentage: 0 },
      weekly: calculateChange(weekSnapshot?.totalNetWorth),
      monthly: calculateChange(monthSnapshot?.totalNetWorth),
      yearly: calculateChange(yearSnapshot?.totalNetWorth)
    },
    allTime: allTime[0] || {
      allTimeHigh: currentNetWorth,
      allTimeLow: currentNetWorth,
      avgNetWorth: currentNetWorth,
      snapshotCount: 0
    },
    lastUpdated: latest?.date || null
  };
};

netWorthSnapshotSchema.statics.createSnapshot = async function(userId, accounts, exchangeRates, baseCurrency = 'USD') {
  const Account = mongoose.model('Account');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Get previous snapshot for change calculation
  const previousSnapshot = await this.findOne({
    userId,
    baseCurrency,
    date: { $lt: today }
  }).sort({ date: -1 });
  
  // Calculate totals
  let totalAssets = 0;
  let totalLiabilities = 0;
  const byAccountType = {};
  const currencyTotals = {};
  const accountSnapshots = [];
  const missingRates = [];
  
  for (const account of accounts) {
    if (!account.includeInNetWorth) continue;
    
    const rate = account.currency === baseCurrency ? 1 : 
      (exchangeRates.get ? exchangeRates.get(account.currency) : exchangeRates[account.currency]) || null;
    
    if (!rate && account.currency !== baseCurrency) {
      missingRates.push(account.currency);
    }
    
    const balanceInBase = rate ? account.balance * rate : account.balance;
    const effectiveBalance = ['credit_card', 'loan'].includes(account.type) 
      ? -Math.abs(balanceInBase) 
      : balanceInBase;
    
    // Account snapshot
    accountSnapshots.push({
      accountId: account._id,
      name: account.name,
      type: account.type,
      balance: account.balance,
      currency: account.currency,
      balanceInBaseCurrency: effectiveBalance,
      exchangeRate: rate
    });
    
    // Totals
    if (effectiveBalance >= 0) {
      totalAssets += effectiveBalance;
    } else {
      totalLiabilities += Math.abs(effectiveBalance);
    }
    
    // By type
    byAccountType[account.type] = (byAccountType[account.type] || 0) + effectiveBalance;
    
    // Currency breakdown
    if (!currencyTotals[account.currency]) {
      currencyTotals[account.currency] = {
        currency: account.currency,
        totalBalance: 0,
        balanceInBaseCurrency: 0,
        exchangeRate: rate,
        accountCount: 0
      };
    }
    currencyTotals[account.currency].totalBalance += account.balance;
    currencyTotals[account.currency].balanceInBaseCurrency += effectiveBalance;
    currencyTotals[account.currency].accountCount++;
  }
  
  const totalNetWorth = totalAssets - totalLiabilities;
  
  // Calculate currency percentages
  const currencyBreakdown = Object.values(currencyTotals).map(c => ({
    ...c,
    percentage: totalNetWorth !== 0 ? (c.balanceInBaseCurrency / totalNetWorth) * 100 : 0
  }));
  
  // Calculate change
  const change = {
    amount: previousSnapshot ? totalNetWorth - previousSnapshot.totalNetWorth : 0,
    percentage: previousSnapshot && previousSnapshot.totalNetWorth !== 0 
      ? ((totalNetWorth - previousSnapshot.totalNetWorth) / Math.abs(previousSnapshot.totalNetWorth)) * 100 
      : 0,
    previousNetWorth: previousSnapshot?.totalNetWorth || 0
  };
  
  // Create or update snapshot
  return this.findOneAndUpdate(
    { userId, date: today, baseCurrency },
    {
      $set: {
        totalNetWorth,
        totalAssets,
        totalLiabilities,
        change,
        byAccountType,
        currencyBreakdown,
        accounts: accountSnapshots,
        exchangeRates: exchangeRates instanceof Map ? Object.fromEntries(exchangeRates) : exchangeRates,
        snapshotSource: 'cron',
        dataQuality: {
          completeAccounts: accountSnapshots.length,
          totalAccounts: accounts.length,
          missingRates
        }
      }
    },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model('NetWorthSnapshot', netWorthSnapshotSchema);
