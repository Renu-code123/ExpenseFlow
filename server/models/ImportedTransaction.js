const mongoose = require('mongoose');

const importedTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  linkedAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LinkedAccount',
    required: true,
    index: true
  },
  
  bankConnection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankConnection',
    required: true
  },
  
  // Provider transaction ID
  transactionId: {
    type: String,
    required: true
  },
  
  // Linked manual expense (if matched)
  matchedExpense: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  },
  
  // Transaction details
  amount: {
    type: Number,
    required: true
  },
  
  isoCurrencyCode: {
    type: String,
    default: 'USD'
  },
  
  date: {
    type: Date,
    required: true,
    index: true
  },
  
  authorizedDate: Date,
  
  // Original merchant info
  merchant: {
    name: String,
    cleanName: String, // Enriched/cleaned name
    logo: String,
    category: String,
    website: String,
    location: {
      address: String,
      city: String,
      region: String,
      postalCode: String,
      country: String,
      lat: Number,
      lon: Number,
      storeNumber: String
    }
  },
  
  // Original and cleaned descriptions
  description: {
    original: String,
    clean: String,
    detailed: String
  },
  
  // Categorization
  category: {
    primary: String,
    detailed: String,
    confidence: Number,
    source: {
      type: String,
      enum: ['provider', 'ai', 'rule', 'manual'],
      default: 'provider'
    }
  },
  
  expenseCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxCategory'
  },
  
  // Transaction type
  type: {
    type: String,
    enum: ['debit', 'credit'],
    required: true
  },
  
  // Payment channel
  paymentChannel: {
    type: String,
    enum: ['online', 'in_store', 'other']
  },
  
  // Transaction status
  status: {
    type: String,
    enum: ['pending', 'posted', 'cancelled'],
    default: 'posted'
  },
  
  // Review/Approval status
  reviewStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'auto_approved'],
    default: 'pending'
  },
  
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  reviewedAt: Date,
  
  reviewNotes: String,
  
  // Matching status
  matchStatus: {
    type: String,
    enum: ['unmatched', 'matched', 'duplicate', 'manual_match', 'no_match_needed'],
    default: 'unmatched'
  },
  
  matchConfidence: Number,
  
  potentialMatches: [{
    expenseId: mongoose.Schema.Types.ObjectId,
    confidence: Number,
    matchReasons: [String]
  }],
  
  // Deduplication
  isDuplicate: {
    type: Boolean,
    default: false
  },
  
  duplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ImportedTransaction'
  },
  
  // Hash for deduplication
  transactionHash: {
    type: String,
    index: true
  },
  
  // Flags
  flags: {
    isRecurring: Boolean,
    recurringPattern: String,
    isTransfer: Boolean,
    transferPairId: mongoose.Schema.Types.ObjectId,
    isRefund: Boolean,
    refundOf: mongoose.Schema.Types.ObjectId,
    isSubscription: Boolean,
    subscriptionId: mongoose.Schema.Types.ObjectId,
    requiresReceipt: Boolean,
    isLargeTransaction: Boolean,
    isUnusual: Boolean,
    unusualReason: String
  },
  
  // Tags
  tags: [String],
  
  // Notes
  userNotes: String,
  
  // Import metadata
  import: {
    batchId: String,
    importedAt: {
      type: Date,
      default: Date.now
    },
    source: {
      type: String,
      enum: ['sync', 'webhook', 'manual', 'backfill'],
      default: 'sync'
    }
  },
  
  // Raw data from provider
  rawData: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Compound indexes
importedTransactionSchema.index({ user: 1, date: -1 });
importedTransactionSchema.index({ linkedAccount: 1, date: -1 });
importedTransactionSchema.index({ transactionId: 1, bankConnection: 1 }, { unique: true });
importedTransactionSchema.index({ user: 1, reviewStatus: 1 });
importedTransactionSchema.index({ user: 1, matchStatus: 1 });
importedTransactionSchema.index({ 'merchant.name': 1 });
importedTransactionSchema.index({ 'category.primary': 1 });

// Generate transaction hash for deduplication
importedTransactionSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('amount') || this.isModified('date') || this.isModified('description.original')) {
    const crypto = require('crypto');
    const hashData = `${this.linkedAccount}-${this.amount}-${this.date.toISOString().split('T')[0]}-${this.description.original}`;
    this.transactionHash = crypto.createHash('sha256').update(hashData).digest('hex');
  }
  next();
});

// Check if transaction needs receipt
importedTransactionSchema.pre('save', function(next) {
  if (this.isNew) {
    // Flag large transactions
    this.flags.isLargeTransaction = Math.abs(this.amount) >= 500;
    
    // Business categories that typically need receipts
    const receiptCategories = ['travel', 'food_and_drink', 'shops', 'service'];
    this.flags.requiresReceipt = this.flags.isLargeTransaction || 
      receiptCategories.some(cat => this.category.primary?.toLowerCase().includes(cat));
  }
  next();
});

// Enrich transaction data
importedTransactionSchema.methods.enrich = async function(merchantDB) {
  if (!this.merchant.name) return;
  
  // Try to find merchant in database
  if (merchantDB) {
    const merchantInfo = await merchantDB.findOne({ 
      name: { $regex: new RegExp(this.merchant.name, 'i') }
    });
    
    if (merchantInfo) {
      this.merchant.cleanName = merchantInfo.cleanName;
      this.merchant.logo = merchantInfo.logo;
      this.merchant.category = merchantInfo.category;
      this.merchant.website = merchantInfo.website;
    }
  }
  
  // Clean up description
  if (this.description.original) {
    this.description.clean = this.cleanDescription(this.description.original);
  }
};

// Clean transaction description
importedTransactionSchema.methods.cleanDescription = function(original) {
  if (!original) return '';
  
  let clean = original;
  
  // Remove common prefixes
  clean = clean.replace(/^(POS|ACH|DEBIT|CREDIT|CARD|PURCHASE|PAYMENT)\s*/i, '');
  
  // Remove transaction numbers/codes
  clean = clean.replace(/\s*#\d+/g, '');
  clean = clean.replace(/\s*\d{10,}/g, '');
  
  // Remove dates in descriptions
  clean = clean.replace(/\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '');
  
  // Remove extra spaces
  clean = clean.replace(/\s+/g, ' ').trim();
  
  // Title case
  clean = clean.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  
  return clean;
};

// Find potential expense matches
importedTransactionSchema.methods.findPotentialMatches = async function() {
  const Expense = mongoose.model('Expense');
  
  const dateRange = {
    start: new Date(this.date),
    end: new Date(this.date)
  };
  dateRange.start.setDate(dateRange.start.getDate() - 3);
  dateRange.end.setDate(dateRange.end.getDate() + 3);
  
  const candidates = await Expense.find({
    user: this.user,
    amount: { $gte: this.amount * 0.95, $lte: this.amount * 1.05 },
    date: { $gte: dateRange.start, $lte: dateRange.end },
    linkedTransaction: { $exists: false }
  });
  
  const matches = candidates.map(expense => {
    let confidence = 0;
    const reasons = [];
    
    // Amount match
    if (expense.amount === Math.abs(this.amount)) {
      confidence += 40;
      reasons.push('Exact amount match');
    } else {
      confidence += 20;
      reasons.push('Close amount match');
    }
    
    // Date match
    const daysDiff = Math.abs((expense.date - this.date) / (1000 * 60 * 60 * 24));
    if (daysDiff === 0) {
      confidence += 30;
      reasons.push('Same day');
    } else if (daysDiff <= 1) {
      confidence += 20;
      reasons.push('Within 1 day');
    } else {
      confidence += 10;
      reasons.push('Within date range');
    }
    
    // Description/merchant match
    const merchantName = (this.merchant.cleanName || this.merchant.name || '').toLowerCase();
    const expenseDesc = (expense.description || '').toLowerCase();
    if (merchantName && expenseDesc.includes(merchantName.substring(0, 5))) {
      confidence += 30;
      reasons.push('Merchant name match');
    }
    
    return {
      expenseId: expense._id,
      confidence,
      matchReasons: reasons
    };
  });
  
  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
};

// Auto-approve rule check
importedTransactionSchema.methods.shouldAutoApprove = function() {
  // Don't auto-approve large transactions
  if (this.flags.isLargeTransaction) return false;
  
  // Don't auto-approve unusual transactions
  if (this.flags.isUnusual) return false;
  
  // Auto-approve known recurring transactions
  if (this.flags.isRecurring) return true;
  
  // Auto-approve small transactions under $50
  if (Math.abs(this.amount) < 50) return true;
  
  // Auto-approve high-confidence categorized transactions
  if (this.category.confidence && this.category.confidence >= 0.9) return true;
  
  return false;
};

// Static: Find duplicates for a batch of transactions
importedTransactionSchema.statics.findDuplicates = async function(transactions, userId) {
  const hashes = transactions.map(t => {
    const crypto = require('crypto');
    const hashData = `${t.linkedAccount}-${t.amount}-${new Date(t.date).toISOString().split('T')[0]}-${t.description?.original || t.name}`;
    return crypto.createHash('sha256').update(hashData).digest('hex');
  });
  
  const existing = await this.find({
    user: userId,
    transactionHash: { $in: hashes }
  }).select('transactionHash transactionId');
  
  const existingHashes = new Set(existing.map(t => t.transactionHash));
  
  return transactions.map((t, i) => ({
    ...t,
    isDuplicate: existingHashes.has(hashes[i])
  }));
};

// Static: Get pending review count
importedTransactionSchema.statics.getPendingReviewCount = function(userId) {
  return this.countDocuments({ user: userId, reviewStatus: 'pending' });
};

// Static: Get unmatched transactions
importedTransactionSchema.statics.getUnmatched = function(userId, limit = 50) {
  return this.find({
    user: userId,
    matchStatus: 'unmatched',
    reviewStatus: { $ne: 'rejected' }
  })
    .sort({ date: -1 })
    .limit(limit)
    .populate('linkedAccount', 'name type');
};

// Static: Get import statistics
importedTransactionSchema.statics.getImportStats = async function(userId, days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  const stats = await this.aggregate([
    { $match: { user: mongoose.Types.ObjectId(userId), 'import.importedAt': { $gte: cutoff } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        totalAmount: { $sum: { $abs: '$amount' } },
        pending: { $sum: { $cond: [{ $eq: ['$reviewStatus', 'pending'] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $eq: ['$reviewStatus', 'approved'] }, 1, 0] } },
        autoApproved: { $sum: { $cond: [{ $eq: ['$reviewStatus', 'auto_approved'] }, 1, 0] } },
        matched: { $sum: { $cond: [{ $eq: ['$matchStatus', 'matched'] }, 1, 0] } },
        duplicates: { $sum: { $cond: ['$isDuplicate', 1, 0] } }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    totalAmount: 0,
    pending: 0,
    approved: 0,
    autoApproved: 0,
    matched: 0,
    duplicates: 0
  };
};

// Static: Bulk update review status
importedTransactionSchema.statics.bulkReview = async function(transactionIds, status, reviewerId, notes) {
  return this.updateMany(
    { _id: { $in: transactionIds } },
    {
      $set: {
        reviewStatus: status,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: notes
      }
    }
  );
};

module.exports = mongoose.model('ImportedTransaction', importedTransactionSchema);
