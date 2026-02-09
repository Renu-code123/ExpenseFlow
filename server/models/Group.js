const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxLength: 100
  },
  description: {
    type: String,
    trim: true,
    maxLength: 500
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  expenses: [{
    expense: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense',
      required: true
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  totalExpenses: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'NZD',
           'SEK', 'KRW', 'SGD', 'NOK', 'MXN', 'INR', 'RUB', 'ZAR', 'TRY', 'BRL',
           'TWD', 'DKK', 'PLN', 'THB', 'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP',
           'AED', 'SAR', 'MYR', 'RON']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    allowPublicExpenses: {
      type: Boolean,
      default: false
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    defaultSplitMethod: {
      type: String,
      enum: ['equal', 'percentage', 'amount'],
      default: 'equal'
    }
  }
}, {
  timestamps: true
});

// Indexes
groupSchema.index({ createdBy: 1 });
groupSchema.index({ 'members.user': 1 });
groupSchema.index({ isActive: 1 });

// Virtual for member count
groupSchema.virtual('memberCount').get(function() {
  return this.members.filter(member => member.isActive).length;
});

// Virtual for active expenses count
groupSchema.virtual('activeExpenseCount').get(function() {
  return this.expenses.length;
});

// Method to check if user is member
groupSchema.methods.isMember = function(userId) {
  return this.members.some(member =>
    member.user.toString() === userId.toString() && member.isActive
  );
};

// Method to check if user is admin
groupSchema.methods.isAdmin = function(userId) {
  return this.members.some(member =>
    member.user.toString() === userId.toString() &&
    member.role === 'admin' &&
    member.isActive
  );
};

// Method to add member
groupSchema.methods.addMember = function(userId, role = 'member') {
  if (this.isMember(userId)) {
    throw new Error('User is already a member of this group');
  }

  this.members.push({
    user: userId,
    role: role,
    joinedAt: new Date(),
    isActive: true
  });
};

// Method to remove member
groupSchema.methods.removeMember = function(userId) {
  const memberIndex = this.members.findIndex(member =>
    member.user.toString() === userId.toString()
  );

  if (memberIndex === -1) {
    throw new Error('User is not a member of this group');
  }

  this.members[memberIndex].isActive = false;
};

// Method to add expense
groupSchema.methods.addExpense = function(expenseId, userId) {
  if (!this.isMember(userId)) {
    throw new Error('User is not a member of this group');
  }

  this.expenses.push({
    expense: expenseId,
    addedBy: userId,
    addedAt: new Date()
  });
};

// Static method to find user's groups
groupSchema.statics.findUserGroups = function(userId) {
  return this.find({
    'members.user': userId,
    'members.isActive': true,
    isActive: true
  }).populate('members.user', 'name email');
};

// Pre-save middleware to update member count
groupSchema.pre('save', function(next) {
  this.totalExpenses = this.expenses.length;
  next();
});

module.exports = mongoose.model('Group', groupSchema);
