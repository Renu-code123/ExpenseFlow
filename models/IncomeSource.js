const mongoose = require('mongoose');

const incomeSourceSchema = new mongoose.Schema(
  {
    // User reference
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Source identification
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: String,

    // Income type
    type: {
      type: String,
      enum: ['salary', 'freelance', 'investment', 'rental', 'business', 'pension', 'social_security', 'dividend', 'interest', 'gift', 'other'],
      required: true,
      index: true
    },
    subtype: String,
    category: String,

    // Amount details
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'INR', 'GBP', 'CAD', 'AUD', 'EUR', 'SGD', 'HKD', 'JPY', 'KRW', 'BRL']
    },

    // Frequency and recurrence
    frequency: {
      type: String,
      enum: ['one_time', 'daily', 'weekly', 'bi_weekly', 'monthly', 'quarterly', 'semi_annual', 'annual'],
      required: true,
      index: true
    },
    recurrencePattern: {
      dayOfWeek: {
        type: Number,
        min: 0,
        max: 6,
        description: '0 = Sunday, 6 = Saturday'
      },
      dayOfMonth: {
        type: Number,
        min: 1,
        max: 31
      },
      weekOfMonth: {
        type: Number,
        min: 1,
        max: 5
      },
      monthsOfYear: {
        type: [Number],
        description: 'For quarterly/annual, which months'
      }
    },

    // Expected dates
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      default: null
    },
    nextExpectedDate: {
      type: Date,
      index: true
    },
    lastReceivedDate: Date,

    // Variability
    variability: {
      type: String,
      enum: ['fixed', 'variable', 'seasonal'],
      default: 'fixed'
    },
    variabilityMetrics: {
      averageAmount: Number,
      minAmount: Number,
      maxAmount: Number,
      standardDeviation: Number,
      coefficientOfVariation: {
        type: Number,
        description: 'CV = stdDev / mean'
      }
    },

    // Historical data
    historicalPayments: {
      type: [
        {
          date: Date,
          amount: Number,
          actualAmount: Number,
          variance: Number,
          notes: String
        }
      ],
      default: []
    },
    paymentCount: {
      type: Number,
      default: 0
    },
    totalReceived: {
      type: Number,
      default: 0
    },

    // Confidence and reliability
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Confidence in prediction (0-1)'
    },
    reliability: {
      type: Number,
      min: 0,
      max: 1,
      default: 1,
      description: 'Historical reliability score'
    },
    onTimeRate: {
      type: Number,
      min: 0,
      max: 1,
      default: 1,
      description: 'Percentage of on-time payments'
    },

    // Linked entities
    linkedBankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankLink',
      default: null
    },
    linkedTransactions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Expense'
      }
    ],

    // Source information
    source: {
      employer: String,
      client: String,
      platform: String,
      accountNumber: String,
      referenceNumber: String
    },

    // Tax information
    taxInfo: {
      isTaxable: {
        type: Boolean,
        default: true
      },
      taxRate: Number,
      netAmount: Number,
      grossAmount: Number,
      deductions: [
        {
          name: String,
          amount: Number,
          type: String
        }
      ]
    },

    // Status
    status: {
      type: String,
      enum: ['active', 'paused', 'ended', 'pending'],
      default: 'active',
      index: true
    },
    isPrimary: {
      type: Boolean,
      default: false,
      description: 'Is this the primary income source'
    },

    // Notifications
    notifications: {
      enabled: {
        type: Boolean,
        default: true
      },
      notifyDaysBefore: {
        type: Number,
        default: 1
      },
      notifyOnMissed: {
        type: Boolean,
        default: true
      }
    },

    // Growth tracking
    growthRate: {
      type: Number,
      description: 'Annual growth rate percentage'
    },
    lastIncrease: {
      date: Date,
      oldAmount: Number,
      newAmount: Number,
      percentage: Number
    },

    // Tags and metadata
    tags: [String],
    notes: String,
    isArchived: {
      type: Boolean,
      default: false
    },
    archivedAt: Date
  },
  {
    timestamps: true,
    collection: 'income_sources'
  }
);

// Indexes
incomeSourceSchema.index({ user: 1, status: 1 });
incomeSourceSchema.index({ user: 1, type: 1 });
incomeSourceSchema.index({ nextExpectedDate: 1 });
incomeSourceSchema.index({ frequency: 1 });
incomeSourceSchema.index({ isPrimary: -1 });

// Methods
incomeSourceSchema.methods.calculateNextExpectedDate = function() {
  if (!this.frequency || this.frequency === 'one_time') {
    return this.nextExpectedDate;
  }

  const lastDate = this.lastReceivedDate || this.startDate;
  let nextDate = new Date(lastDate);

  switch (this.frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'bi_weekly':
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      if (this.recurrencePattern?.dayOfMonth) {
        nextDate.setDate(this.recurrencePattern.dayOfMonth);
      }
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'semi_annual':
      nextDate.setMonth(nextDate.getMonth() + 6);
      break;
    case 'annual':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
  }

  this.nextExpectedDate = nextDate;
  return nextDate;
};

incomeSourceSchema.methods.recordPayment = function(amount, date = new Date()) {
  const expectedAmount = this.amount;
  const variance = amount - expectedAmount;
  const variancePercentage = (variance / expectedAmount) * 100;

  this.historicalPayments.push({
    date,
    amount: expectedAmount,
    actualAmount: amount,
    variance
  });

  // Keep only last 12 payments
  if (this.historicalPayments.length > 12) {
    this.historicalPayments = this.historicalPayments.slice(-12);
  }

  this.lastReceivedDate = date;
  this.paymentCount += 1;
  this.totalReceived += amount;

  // Update variability metrics
  this.updateVariabilityMetrics();

  // Calculate next expected date
  this.calculateNextExpectedDate();

  return this.save();
};

incomeSourceSchema.methods.updateVariabilityMetrics = function() {
  if (this.historicalPayments.length < 2) return;

  const amounts = this.historicalPayments.map(p => p.actualAmount);
  const sum = amounts.reduce((a, b) => a + b, 0);
  const avg = sum / amounts.length;

  const variance = amounts.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / amounts.length;
  const stdDev = Math.sqrt(variance);
  const cv = avg !== 0 ? stdDev / avg : 0;

  this.variabilityMetrics = {
    averageAmount: avg,
    minAmount: Math.min(...amounts),
    maxAmount: Math.max(...amounts),
    standardDeviation: stdDev,
    coefficientOfVariation: cv
  };

  // Update confidence based on variability
  if (cv < 0.1) {
    this.confidence = 0.95; // Very predictable
  } else if (cv < 0.2) {
    this.confidence = 0.85;
  } else if (cv < 0.3) {
    this.confidence = 0.75;
  } else {
    this.confidence = 0.6; // Highly variable
  }
};

incomeSourceSchema.methods.getPredictedAmount = function() {
  if (this.variability === 'fixed') {
    return this.amount;
  }

  if (this.variabilityMetrics?.averageAmount) {
    return this.variabilityMetrics.averageAmount;
  }

  return this.amount;
};

incomeSourceSchema.methods.isOverdue = function() {
  return this.nextExpectedDate && this.nextExpectedDate < new Date();
};

incomeSourceSchema.methods.daysUntilNext = function() {
  if (!this.nextExpectedDate) return null;
  return Math.ceil((this.nextExpectedDate - new Date()) / (1000 * 60 * 60 * 24));
};

incomeSourceSchema.methods.getTaxableAmount = function() {
  if (!this.taxInfo?.isTaxable) return 0;
  return this.taxInfo.netAmount || this.amount;
};

incomeSourceSchema.methods.archive = function() {
  this.isArchived = true;
  this.archivedAt = new Date();
  this.status = 'ended';
  return this.save();
};

// Static methods
incomeSourceSchema.statics.getUserSources = function(userId) {
  return this.find({ user: userId, isArchived: false }).sort({ isPrimary: -1, nextExpectedDate: 1 });
};

incomeSourceSchema.statics.getActiveSources = function(userId) {
  return this.find({
    user: userId,
    status: 'active',
    isArchived: false
  });
};

incomeSourceSchema.statics.getPrimarySources = function(userId) {
  return this.find({
    user: userId,
    isPrimary: true,
    status: 'active'
  });
};

incomeSourceSchema.statics.getUpcomingIncome = function(userId, days = 30) {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  return this.find({
    user: userId,
    status: 'active',
    nextExpectedDate: {
      $gte: new Date(),
      $lte: endDate
    }
  }).sort({ nextExpectedDate: 1 });
};

incomeSourceSchema.statics.getTotalMonthlyIncome = async function(userId) {
  const sources = await this.find({
    user: userId,
    status: 'active'
  });

  let total = 0;
  sources.forEach(source => {
    const amount = source.getPredictedAmount();
    switch (source.frequency) {
      case 'monthly':
        total += amount;
        break;
      case 'weekly':
        total += amount * 4.33;
        break;
      case 'bi_weekly':
        total += amount * 2.17;
        break;
      case 'quarterly':
        total += amount / 3;
        break;
      case 'annual':
        total += amount / 12;
        break;
    }
  });

  return total;
};

incomeSourceSchema.statics.getSourcesByType = function(userId, type) {
  return this.find({
    user: userId,
    type,
    status: 'active'
  });
};

module.exports = mongoose.model('IncomeSource', incomeSourceSchema);
