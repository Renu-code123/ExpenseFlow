const mongoose = require('mongoose');

// Schema for tracking historical spending patterns
const spendingHistorySchema = new mongoose.Schema({
  period: { type: String, required: true }, // e.g., "2026-01"
  amount: { type: Number, required: true },
  transactionCount: { type: Number, default: 0 },
  recordedAt: { type: Date, default: Date.now }
}, { _id: false });

// Schema for anomaly records
const anomalyRecordSchema = new mongoose.Schema({
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
  amount: { type: Number, required: true },
  zScore: { type: Number, required: true },
  deviation: { type: Number, required: true },
  detectedAt: { type: Date, default: Date.now },
  description: { type: String },
  isResolved: { type: Boolean, default: false },
  resolvedAt: { type: Date }
}, { _id: false });

// Schema for reallocation suggestions
const reallocationSuggestionSchema = new mongoose.Schema({
  fromCategory: { type: String, required: true },
  toCategory: { type: String, required: true },
  suggestedAmount: { type: Number, required: true },
  reason: { type: String },
  deficit: { type: Number },
  surplus: { type: Number },
  createdAt: { type: Date, default: Date.now },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'rejected', 'expired'],
    default: 'pending'
  },
  expiresAt: { type: Date }
}, { _id: false });

const budgetSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  category: {
    type: String,
    enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'education', 'travel', 'other', 'all'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  originalAmount: {
    type: Number,
    min: 0
  },
  period: {
    type: String,
    enum: ['monthly', 'weekly', 'yearly'],
    default: 'monthly'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  alertThreshold: {
    type: Number,
    default: 80,
    min: 0,
    max: 100
  },
  isActive: {
    type: Boolean,
    default: true
  },
  spent: {
    type: Number,
    default: 0
  },
  lastCalculated: {
    type: Date,
    default: Date.now
  },
  
  // Self-Healing Budget Intelligence Fields
  intelligence: {
    // Statistical tracking
    movingAverage: { type: Number, default: 0 },
    standardDeviation: { type: Number, default: 0 },
    volatilityIndex: { type: Number, default: 0 }, // 0-100 scale
    
    // Historical data for Z-Score calculations
    spendingHistory: [spendingHistorySchema],
    
    // Anomaly detection
    anomalies: [anomalyRecordSchema],
    anomalyCount: { type: Number, default: 0 },
    lastAnomalyCheck: { type: Date },
    
    // Self-healing reallocation
    reallocations: [reallocationSuggestionSchema],
    autoHealEnabled: { type: Boolean, default: true },
    healingThreshold: { type: Number, default: 2 }, // Z-Score threshold
    
    // Prediction data
    predictedSpend: { type: Number },
    predictionConfidence: { type: Number }, // 0-100
    trendDirection: { 
      type: String, 
      enum: ['increasing', 'decreasing', 'stable'],
      default: 'stable'
    },
    
    // Learning adaptation
    learningRate: { type: Number, default: 0.1 },
    adaptationHistory: [{
      previousAmount: Number,
      newAmount: Number,
      reason: String,
      adaptedAt: { type: Date, default: Date.now }
    }],
    
    lastUpdated: { type: Date, default: Date.now }
  }
}, {
  timestamps: true
});

// Index for efficient queries
budgetSchema.index({ user: 1, category: 1, period: 1 });
budgetSchema.index({ user: 1, isActive: 1 });
budgetSchema.index({ 'intelligence.lastAnomalyCheck': 1 });

// Virtual for calculating remaining budget
budgetSchema.virtual('remaining').get(function() {
  return Math.max(0, this.amount - this.spent);
});

// Virtual for calculating usage percentage
budgetSchema.virtual('usagePercent').get(function() {
  return this.amount > 0 ? (this.spent / this.amount) * 100 : 0;
});

// Virtual for checking if budget has surplus
budgetSchema.virtual('hasSurplus').get(function() {
  return this.spent < this.amount;
});

// Virtual for surplus amount
budgetSchema.virtual('surplus').get(function() {
  return Math.max(0, this.amount - this.spent);
});

// Virtual for deficit amount
budgetSchema.virtual('deficit').get(function() {
  return Math.max(0, this.spent - this.amount);
});

// Method to add spending history
budgetSchema.methods.addSpendingRecord = function(amount, period) {
  const existingRecord = this.intelligence.spendingHistory.find(h => h.period === period);
  if (existingRecord) {
    existingRecord.amount += amount;
    existingRecord.transactionCount += 1;
  } else {
    this.intelligence.spendingHistory.push({
      period,
      amount,
      transactionCount: 1
    });
  }
  // Keep only last 12 periods
  if (this.intelligence.spendingHistory.length > 12) {
    this.intelligence.spendingHistory = this.intelligence.spendingHistory.slice(-12);
  }
  return this;
};

// Method to record anomaly
budgetSchema.methods.recordAnomaly = function(transactionId, amount, zScore, description) {
  this.intelligence.anomalies.push({
    transactionId,
    amount,
    zScore,
    deviation: Math.abs(zScore) * this.intelligence.standardDeviation,
    description
  });
  this.intelligence.anomalyCount += 1;
  // Keep only last 50 anomalies
  if (this.intelligence.anomalies.length > 50) {
    this.intelligence.anomalies = this.intelligence.anomalies.slice(-50);
  }
  return this;
};

// Method to create reallocation suggestion
budgetSchema.methods.suggestReallocation = function(toCategory, amount, reason, deficit) {
  const suggestion = {
    fromCategory: this.category,
    toCategory,
    suggestedAmount: amount,
    reason,
    deficit,
    surplus: this.surplus,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  };
  this.intelligence.reallocations.push(suggestion);
  return suggestion;
};

// Pre-save hook to set originalAmount
budgetSchema.pre('save', function(next) {
  if (this.isNew && !this.originalAmount) {
    this.originalAmount = this.amount;
  }
  next();
});

// Ensure virtuals are included in JSON
budgetSchema.set('toJSON', { virtuals: true });
budgetSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Budget', budgetSchema);