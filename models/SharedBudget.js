const mongoose = require('mongoose');

const sharedBudgetSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  categoryAllocations: [{
    category: {
      type: String,
      enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other', 'all'],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  memberContributions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  spent: {
    type: Number,
    default: 0
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
    default: 80, // Alert at 80% of budget
    min: 0,
    max: 100
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastCalculated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
sharedBudgetSchema.index({ group: 1, isActive: 1 });
sharedBudgetSchema.index({ 'memberContributions.user': 1 });

// Virtual for remaining amount
sharedBudgetSchema.virtual('remaining').get(function() {
  return this.totalAmount - this.spent;
});

// Method to calculate total spent from group expenses
sharedBudgetSchema.methods.calculateSpent = async function() {
  const Group = mongoose.model('Group');
  const Expense = mongoose.model('Expense');

  const group = await Group.findById(this.group).populate('expenses.expense');
  if (!group) return 0;

  let totalSpent = 0;
  for (const expenseRef of group.expenses) {
    const expense = await Expense.findById(expenseRef.expense);
    if (expense && expense.date >= this.startDate && expense.date <= this.endDate) {
      // Check if expense category matches any allocation
      const allocation = this.categoryAllocations.find(alloc => alloc.category === expense.category || alloc.category === 'all');
      if (allocation) {
        totalSpent += expense.amount;
      }
    }
  }

  this.spent = totalSpent;
  this.lastCalculated = new Date();
  return totalSpent;
};

// Method to check if budget is exceeded
sharedBudgetSchema.methods.isExceeded = function() {
  return this.spent > this.totalAmount;
};

// Method to get alert status
sharedBudgetSchema.methods.getAlertStatus = function() {
  const percentage = (this.spent / this.totalAmount) * 100;
  if (percentage >= 100) return 'exceeded';
  if (percentage >= this.alertThreshold) return 'warning';
  return 'normal';
};

module.exports = mongoose.model('SharedBudget', sharedBudgetSchema);
