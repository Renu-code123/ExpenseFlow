const mongoose = require('mongoose');

const assetTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  portfolio: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Portfolio',
    required: true,
    index: true
  },
  
  asset: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Asset',
    required: true,
    index: true
  },
  
  // Transaction type
  type: {
    type: String,
    enum: ['buy', 'sell', 'dividend', 'interest', 'split', 'transfer_in', 'transfer_out', 'fee', 'deposit', 'withdrawal'],
    required: true
  },
  
  // Transaction details
  quantity: {
    type: Number,
    required: function() {
      return ['buy', 'sell', 'split', 'transfer_in', 'transfer_out'].includes(this.type);
    }
  },
  
  price: {
    type: Number,
    required: function() {
      return ['buy', 'sell'].includes(this.type);
    }
  },
  
  amount: {
    type: Number,
    required: true
  },
  
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  
  // Fees
  fees: {
    commission: { type: Number, default: 0 },
    exchangeFee: { type: Number, default: 0 },
    regulatoryFee: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  
  // For sales - gain/loss tracking
  gainLoss: {
    realized: Number,
    costBasis: Number,
    isShortTerm: Boolean,
    holdingPeriod: Number // Days
  },
  
  // For dividends
  dividend: {
    type: { type: String, enum: ['cash', 'stock', 'special'] },
    perShare: Number,
    exDate: Date,
    payDate: Date,
    reinvested: { type: Boolean, default: false }
  },
  
  // For splits
  split: {
    ratio: String, // e.g., "2:1", "3:2"
    newQuantity: Number,
    oldQuantity: Number
  },
  
  // Transaction date
  date: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  settlementDate: Date,
  
  // Broker/Exchange info
  broker: String,
  exchange: String,
  orderNumber: String,
  
  // Notes
  notes: String,
  tags: [String],
  
  // Linked expense (if tracked as expense too)
  linkedExpense: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  },
  
  // Import info
  importSource: String,
  externalId: String,
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'failed'],
    default: 'completed'
  },
  
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
assetTransactionSchema.index({ user: 1, date: -1 });
assetTransactionSchema.index({ portfolio: 1, date: -1 });
assetTransactionSchema.index({ asset: 1, date: -1 });
assetTransactionSchema.index({ user: 1, type: 1 });

// Calculate total with fees
assetTransactionSchema.pre('save', function(next) {
  // Calculate total fees
  this.fees.total = (this.fees.commission || 0) + 
                    (this.fees.exchangeFee || 0) + 
                    (this.fees.regulatoryFee || 0) + 
                    (this.fees.other || 0);
  
  // Calculate amount if buy/sell
  if (['buy', 'sell'].includes(this.type) && this.quantity && this.price) {
    const baseAmount = this.quantity * this.price;
    this.amount = this.type === 'buy' 
      ? baseAmount + this.fees.total 
      : baseAmount - this.fees.total;
  }
  
  next();
});

// Get transaction summary
assetTransactionSchema.methods.getSummary = function() {
  return {
    type: this.type,
    asset: this.asset,
    quantity: this.quantity,
    price: this.price,
    amount: this.amount,
    fees: this.fees.total,
    date: this.date,
    gainLoss: this.gainLoss?.realized
  };
};

// Static: Get transaction history
assetTransactionSchema.statics.getHistory = function(userId, options = {}) {
  const query = { user: userId, status: 'completed' };
  
  if (options.portfolioId) query.portfolio = options.portfolioId;
  if (options.assetId) query.asset = options.assetId;
  if (options.type) query.type = options.type;
  if (options.startDate || options.endDate) {
    query.date = {};
    if (options.startDate) query.date.$gte = new Date(options.startDate);
    if (options.endDate) query.date.$lte = new Date(options.endDate);
  }
  
  return this.find(query)
    .sort({ date: -1 })
    .limit(options.limit || 100)
    .populate('asset', 'symbol name assetClass')
    .populate('portfolio', 'name');
};

// Static: Get dividend history
assetTransactionSchema.statics.getDividendHistory = function(userId, year) {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59);
  
  return this.find({
    user: userId,
    type: 'dividend',
    date: { $gte: startDate, $lte: endDate },
    status: 'completed'
  })
    .sort({ date: -1 })
    .populate('asset', 'symbol name');
};

// Static: Get realized gains for tax reporting
assetTransactionSchema.statics.getRealizedGains = async function(userId, year) {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59);
  
  const transactions = await this.find({
    user: userId,
    type: 'sell',
    date: { $gte: startDate, $lte: endDate },
    status: 'completed'
  }).populate('asset', 'symbol name');
  
  let shortTermGains = 0;
  let shortTermLosses = 0;
  let longTermGains = 0;
  let longTermLosses = 0;
  
  const lots = [];
  
  for (const txn of transactions) {
    const gain = txn.gainLoss?.realized || 0;
    
    if (txn.gainLoss?.isShortTerm) {
      if (gain >= 0) shortTermGains += gain;
      else shortTermLosses += Math.abs(gain);
    } else {
      if (gain >= 0) longTermGains += gain;
      else longTermLosses += Math.abs(gain);
    }
    
    lots.push({
      asset: txn.asset,
      date: txn.date,
      quantity: txn.quantity,
      proceeds: txn.amount,
      costBasis: txn.gainLoss?.costBasis,
      gain: gain,
      isShortTerm: txn.gainLoss?.isShortTerm,
      holdingPeriod: txn.gainLoss?.holdingPeriod
    });
  }
  
  return {
    shortTerm: {
      gains: shortTermGains,
      losses: shortTermLosses,
      net: shortTermGains - shortTermLosses
    },
    longTerm: {
      gains: longTermGains,
      losses: longTermLosses,
      net: longTermGains - longTermLosses
    },
    totalNet: (shortTermGains - shortTermLosses) + (longTermGains - longTermLosses),
    lots
  };
};

// Static: Get portfolio activity summary
assetTransactionSchema.statics.getActivitySummary = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const result = await this.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        date: { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        totalFees: { $sum: '$fees.total' }
      }
    }
  ]);
  
  const summary = {
    buys: { count: 0, amount: 0 },
    sells: { count: 0, amount: 0 },
    dividends: { count: 0, amount: 0 },
    totalFees: 0
  };
  
  for (const item of result) {
    if (item._id === 'buy') {
      summary.buys = { count: item.count, amount: item.totalAmount };
    } else if (item._id === 'sell') {
      summary.sells = { count: item.count, amount: item.totalAmount };
    } else if (item._id === 'dividend') {
      summary.dividends = { count: item.count, amount: item.totalAmount };
    }
    summary.totalFees += item.totalFees;
  }
  
  return summary;
};

module.exports = mongoose.model('AssetTransaction', assetTransactionSchema);
