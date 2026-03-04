const mongoose = require('mongoose');

const envelopeSchema = new mongoose.Schema({
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
    enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'education', 'travel', 'other', 'general'],
    required: true
  },
  allocatedAmount: {
    type: Number,
    required: true,
    min: 0
  },
  spentAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  rolledOverAmount: {
    type: Number,
    default: 0,
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
  color: {
    type: String,
    default: '#64ffda',
    match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
  },
  icon: {
    type: String,
    default: '💰'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  alertThreshold: {
    type: Number,
    default: 80,
    min: 0,
    max: 100
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  lastResetDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Virtual for remaining amount
envelopeSchema.virtual('remainingAmount').get(function() {
  return this.allocatedAmount + this.rolledOverAmount - this.spentAmount;
});

// Virtual for utilization percentage
envelopeSchema.virtual('utilizationPercentage').get(function() {
  const totalAvailable = this.allocatedAmount + this.rolledOverAmount;
  if (totalAvailable === 0) return 0;
  return Math.round((this.spentAmount / totalAvailable) * 100);
});

// Ensure virtuals are included in JSON
envelopeSchema.set('toJSON', { virtuals: true });
envelopeSchema.set('toObject', { virtuals: true });

// Index for efficient queries
envelopeSchema.index({ user: 1, category: 1, period: 1 });
envelopeSchema.index({ user: 1, isActive: 1 });
envelopeSchema.index({ user: 1, period: 1, startDate: 1 });

module.exports = mongoose.model('Envelope', envelopeSchema);
