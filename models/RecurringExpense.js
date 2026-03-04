const mongoose = require('mongoose');

const recurringExpenseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  category: {
    type: String,
    required: true,
    enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'subscription', 'rent', 'insurance', 'other']
  },
  type: {
    type: String,
    required: true,
    enum: ['income', 'expense'],
    default: 'expense'
  },
  frequency: {
    type: String,
    required: true,
    enum: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']
  },
  customInterval: {
    value: {
      type: Number,
      min: 1,
      default: 1
    },
    unit: {
      type: String,
      enum: ['days', 'weeks', 'months', 'years'],
      default: 'months'
    }
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    default: null
  },
  nextDueDate: {
    type: Date,
    required: true
  },
  lastProcessedDate: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPaused: {
    type: Boolean,
    default: false
  },
  autoCreate: {
    type: Boolean,
    default: true
  },
  reminderDays: {
    type: Number,
    default: 3,
    min: 0,
    max: 30
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  skipNextOccurrence: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  tags: [{
    type: String,
    trim: true
  }],
  totalOccurrences: {
    type: Number,
    default: 0
  },
  totalAmountSpent: {
    type: Number,
    default: 0
  },
  // Issue #444: Subscription Detection Fields
  detection: {
    // How the subscription was added
    source: {
      type: String,
      enum: ['manual', 'auto-detected', 'imported'],
      default: 'manual'
    },
    // Confidence score for auto-detected (0-1)
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null
    },
    // Number of past occurrences found during detection
    occurrencesFound: {
      type: Number,
      default: null
    },
    // Date when auto-detected
    detectedAt: {
      type: Date,
      default: null
    },
    // Whether user has confirmed auto-detection
    isConfirmed: {
      type: Boolean,
      default: true
    },
    // Original merchant key used for detection
    merchantKey: {
      type: String,
      default: null
    },
    // Average interval in days between transactions
    averageInterval: {
      type: Number,
      default: null
    }
  }
}, {
  timestamps: true
});

// Index for efficient queries
recurringExpenseSchema.index({ user: 1, isActive: 1 });
recurringExpenseSchema.index({ nextDueDate: 1, isActive: 1, isPaused: 1 });
recurringExpenseSchema.index({ user: 1, nextDueDate: 1 });
recurringExpenseSchema.index({ user: 1, 'detection.source': 1 }); // Issue #444: Auto-detection index

// Calculate next due date based on frequency
recurringExpenseSchema.methods.calculateNextDueDate = function() {
  const currentDate = this.nextDueDate || this.startDate;
  let nextDate = new Date(currentDate);

  switch (this.frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'biweekly':
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
    default:
      // Custom interval
      if (this.customInterval && this.customInterval.value) {
        switch (this.customInterval.unit) {
          case 'days':
            nextDate.setDate(nextDate.getDate() + this.customInterval.value);
            break;
          case 'weeks':
            nextDate.setDate(nextDate.getDate() + (this.customInterval.value * 7));
            break;
          case 'months':
            nextDate.setMonth(nextDate.getMonth() + this.customInterval.value);
            break;
          case 'years':
            nextDate.setFullYear(nextDate.getFullYear() + this.customInterval.value);
            break;
        }
      }
  }

  return nextDate;
};

// Check if the recurring expense is due
recurringExpenseSchema.methods.isDue = function() {
  if (!this.isActive || this.isPaused) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(this.nextDueDate);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate <= today;
};

// Check if reminder should be sent
recurringExpenseSchema.methods.shouldSendReminder = function() {
  if (!this.isActive || this.isPaused || this.reminderSent) return false;
  if (this.reminderDays === 0) return false;
  
  const today = new Date();
  const dueDate = new Date(this.nextDueDate);
  const reminderDate = new Date(dueDate);
  reminderDate.setDate(reminderDate.getDate() - this.reminderDays);
  
  return today >= reminderDate && today < dueDate;
};

// Get monthly cost estimate
recurringExpenseSchema.methods.getMonthlyEstimate = function() {
  switch (this.frequency) {
    case 'daily':
      return this.amount * 30;
    case 'weekly':
      return this.amount * 4.33;
    case 'biweekly':
      return this.amount * 2.17;
    case 'monthly':
      return this.amount;
    case 'quarterly':
      return this.amount / 3;
    case 'yearly':
      return this.amount / 12;
    default:
      return this.amount;
  }
};

// Static method to get upcoming expenses
recurringExpenseSchema.statics.getUpcoming = async function(userId, days = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return await this.find({
    user: userId,
    isActive: true,
    isPaused: false,
    nextDueDate: { $lte: futureDate }
  }).sort({ nextDueDate: 1 });
};

// Static method to get total monthly subscription cost
recurringExpenseSchema.statics.getMonthlyTotal = async function(userId) {
  const recurring = await this.find({
    user: userId,
    isActive: true,
    isPaused: false,
    type: 'expense'
  });
  
  return recurring.reduce((total, item) => total + item.getMonthlyEstimate(), 0);
};

// Issue #444: Get auto-detected subscriptions
recurringExpenseSchema.statics.getAutoDetected = async function(userId) {
  return await this.find({
    user: userId,
    'detection.source': 'auto-detected',
    isActive: true
  }).sort({ 'detection.detectedAt': -1 });
};

// Issue #444: Get subscriptions by detection source
recurringExpenseSchema.statics.getBySource = async function(userId, source) {
  return await this.find({
    user: userId,
    'detection.source': source,
    isActive: true
  });
};

// Issue #444: Calculate total monthly burn rate
recurringExpenseSchema.statics.calculateBurnRate = async function(userId) {
  const recurring = await this.find({
    user: userId,
    isActive: true,
    isPaused: false
  });
  
  let monthlyExpenses = 0;
  let monthlyIncome = 0;

  recurring.forEach(item => {
    const monthly = item.getMonthlyEstimate();
    if (item.type === 'expense') {
      monthlyExpenses += monthly;
    } else {
      monthlyIncome += monthly;
    }
  });

  return {
    monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
    monthlyIncome: Math.round(monthlyIncome * 100) / 100,
    netMonthlyBurn: Math.round((monthlyExpenses - monthlyIncome) * 100) / 100,
    dailyBurn: Math.round(((monthlyExpenses - monthlyIncome) / 30) * 100) / 100
  };
};

module.exports = mongoose.model('RecurringExpense', recurringExpenseSchema);
