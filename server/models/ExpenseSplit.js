const mongoose = require('mongoose');

const expenseSplitSchema = new mongoose.Schema({
  expense: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense',
    required: true
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  splitMethod: {
    type: String,
    enum: ['equal', 'percentage', 'amount'],
    required: true
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    percentage: {
      type: Number,
      min: 0,
      max: 100
    },
    isPaid: {
      type: Boolean,
      default: false
    },
    paidAt: {
      type: Date
    }
  }],
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'partial', 'completed'],
    default: 'pending'
  },
  reminders: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['email', 'push', 'sms']
    }
  }],
  notes: {
    type: String,
    trim: true,
    maxLength: 500
  }
}, {
  timestamps: true
});

// Indexes
expenseSplitSchema.index({ expense: 1 });
expenseSplitSchema.index({ group: 1 });
expenseSplitSchema.index({ 'participants.user': 1 });
expenseSplitSchema.index({ status: 1 });

// Virtual for completion percentage
expenseSplitSchema.virtual('completionPercentage').get(function() {
  const paidParticipants = this.participants.filter(p => p.isPaid).length;
  return this.participants.length > 0 ? (paidParticipants / this.participants.length) * 100 : 0;
});

// Virtual for total paid amount
expenseSplitSchema.virtual('totalPaidAmount').get(function() {
  return this.participants
    .filter(p => p.isPaid)
    .reduce((sum, p) => sum + p.amount, 0);
});

// Method to mark participant as paid
expenseSplitSchema.methods.markAsPaid = function(userId) {
  const participant = this.participants.find(p =>
    p.user.toString() === userId.toString()
  );

  if (!participant) {
    throw new Error('Participant not found in this split');
  }

  if (participant.isPaid) {
    throw new Error('Participant already marked as paid');
  }

  participant.isPaid = true;
  participant.paidAt = new Date();

  // Update status
  const allPaid = this.participants.every(p => p.isPaid);
  this.status = allPaid ? 'completed' : 'partial';

  return this.save();
};

// Method to add reminder
expenseSplitSchema.methods.addReminder = function(userId, type = 'email') {
  this.reminders.push({
    user: userId,
    sentAt: new Date(),
    type: type
  });

  return this.save();
};

// Static method to find user's pending splits
expenseSplitSchema.statics.findUserPendingSplits = function(userId) {
  return this.find({
    'participants.user': userId,
    'participants.isPaid': false,
    status: { $ne: 'completed' }
  })
  .populate('expense', 'description amount category type date')
  .populate('group', 'name')
  .populate('createdBy', 'name')
  .populate('participants.user', 'name email');
};

// Static method to find splits by expense
expenseSplitSchema.statics.findByExpense = function(expenseId) {
  return this.find({ expense: expenseId })
    .populate('participants.user', 'name email')
    .populate('createdBy', 'name');
};

// Pre-save middleware to validate split amounts
expenseSplitSchema.pre('save', function(next) {
  if (this.splitMethod === 'equal') {
    // For equal splits, all participants should have the same amount
    const equalAmount = this.totalAmount / this.participants.length;
    this.participants.forEach(p => {
      p.amount = equalAmount;
    });
  } else if (this.splitMethod === 'percentage') {
    // For percentage splits, validate that percentages add up to 100
    const totalPercentage = this.participants.reduce((sum, p) => sum + (p.percentage || 0), 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return next(new Error('Percentages must add up to 100%'));
    }
    // Calculate amounts from percentages
    this.participants.forEach(p => {
      p.amount = (this.totalAmount * p.percentage) / 100;
    });
  } else if (this.splitMethod === 'amount') {
    // For amount splits, validate that amounts add up to total
    const totalSplitAmount = this.participants.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(totalSplitAmount - this.totalAmount) > 0.01) {
      return next(new Error('Split amounts must add up to total expense amount'));
    }
  }

  next();
});

module.exports = mongoose.model('ExpenseSplit', expenseSplitSchema);
