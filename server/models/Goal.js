const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  targetAmount: {
    type: Number,
    required: true,
    min: 0.01
  },
  currentAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  goalType: {
    type: String,
    enum: ['savings', 'expense_reduction', 'income_increase', 'debt_payoff', 'emergency_fund'],
    required: true,
    default: 'savings'
  },
  category: {
    type: String,
    enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other', 'general', 'travel', 'car', 'house', 'education'],
    default: 'general'
  },
  targetDate: {
    type: Date,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'paused', 'cancelled'],
    default: 'active'
  },
  autoAllocate: {
    type: Boolean,
    default: false
  },
  milestones: [{
    percentage: {
      type: Number,
      required: true
    },
    achieved: {
      type: Boolean,
      default: false
    },
    achievedDate: Date,
    isNotified: {
      type: Boolean,
      default: false
    }
  }],
  reminderFrequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'none'],
    default: 'weekly'
  },
  color: {
    type: String,
    default: '#64ffda'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Calculate progress percentage
goalSchema.virtual('progress').get(function () {
  if (this.targetAmount === 0) return 0;
  return Math.min(Math.round((this.currentAmount / this.targetAmount) * 100), 100);
});

// Calculate remaining amount
goalSchema.virtual('remainingAmount').get(function () {
  return Math.max(0, this.targetAmount - this.currentAmount);
});

// Calculate days remaining
goalSchema.virtual('daysRemaining').get(function () {
  const diff = this.targetDate - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

// Check if goal is overdue
goalSchema.virtual('isOverdue').get(function () {
  return new Date() > this.targetDate && this.status === 'active' && this.currentAmount < this.targetAmount;
});

goalSchema.index({ user: 1, status: 1 });
goalSchema.index({ user: 1, targetDate: 1 });

module.exports = mongoose.model('Goal', goalSchema);