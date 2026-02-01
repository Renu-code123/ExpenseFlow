const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
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
  originalAmount: {
    type: Number,
    required: true,
    min: 0.01
  },
  originalCurrency: {
    type: String,
    required: true,
    default: 'INR',
    uppercase: true
  },
  convertedAmount: {
    type: Number,
    min: 0.01
  },
  convertedCurrency: {
    type: String,
    uppercase: true
  },
  exchangeRate: {
    type: Number,
    min: 0
  },
  category: {
    type: String,
    required: true,
    enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other']
  },
  type: {
    type: String,
    required: true,
    enum: ['income', 'expense']
  },
  merchant: {
    type: String,
    trim: true,
    maxlength: 50,
    default: ''
  },
  date: {
    type: Date,
    default: Date.now
  },
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    default: null
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  syncedToAccounting: {
    type: Boolean,
    default: false
  },
  version: {
    type: Number,
    default: 1
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now
  },
  
  // Approval workflow fields
  approvalStatus: {
    type: String,
    enum: ['draft', 'pending_approval', 'approved', 'rejected'],
    default: 'draft',
    index: true
  },
  policyFlags: [{
    policyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Policy'
    },
    policyName: String,
    riskScore: Number,
    flaggedAt: {
      type: Date,
      default: Date.now
    }
  }],
  requiresApproval: {
    type: Boolean,
    default: false
  },
  escalatedApproval: {
    type: Boolean,
    default: false
  },
  fundHeld: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Approval chain
  approvals: [{
    stage: Number,
    approverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approverRole: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    notes: String,
    approvedAt: Date,
    rejectionReason: String
  }],
  
  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Middleware to increment version on save
expenseSchema.pre('save', function (next) {
  if (this.isModified()) {
    this.version += 1;
    this.lastSyncedAt = Date.now();
  }
  next();
});

// Indexes for performance optimization
expenseSchema.index({ user: 1, date: -1 });
expenseSchema.index({ workspace: 1, date: -1 });
expenseSchema.index({ user: 1, type: 1, date: -1 });
expenseSchema.index({ workspace: 1, type: 1, date: -1 });
expenseSchema.index({ user: 1, category: 1, date: -1 });
expenseSchema.index({ workspace: 1, category: 1, date: -1 });
expenseSchema.index({ approvalStatus: 1, workspace: 1 });
expenseSchema.index({ fundHeld: 1, workspace: 1 });
expenseSchema.index({ createdBy: 1, approvalStatus: 1 });
expenseSchema.index({ receiptId: 1 });
expenseSchema.index({ source: 1, user: 1 });

module.exports = mongoose.model('Expense', expenseSchema);