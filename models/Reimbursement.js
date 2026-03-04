const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const approvalHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected', 'paid', 'cancelled'],
    required: true
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changedAt: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, {
  timestamps: true
});

const paymentDetailsSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'check', 'bank_transfer', 'credit_card', 'debit_card', 'digital_wallet', 'other'],
    default: 'bank_transfer'
  },
  transactionId: {
    type: String,
    trim: true,
    maxlength: 100
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, {
  timestamps: true
});

const reimbursementSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  claimNumber: {
    type: String,
    unique: true,
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
    maxlength: 1000
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  originalAmount: {
    type: Number,
    min: 0.01
  },
  originalCurrency: {
    type: String,
    default: 'INR',
    uppercase: true
  },
  convertedAmount: {
    type: Number,
    min: 0.01
  },
  exchangeRate: {
    type: Number,
    min: 0
  },
  category: {
    type: String,
    required: true,
    enum: ['travel', 'meals', 'office_supplies', 'equipment', 'training', 'entertainment', 'transportation', 'accommodation', 'medical', 'other']
  },
  expenseDate: {
    type: Date,
    required: true
  },
  submissionDate: {
    type: Date,
    default: Date.now
  },
  payee: {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      trim: true,
      maxlength: 100
    },
    employeeId: {
      type: String,
      trim: true,
      maxlength: 50
    },
    department: {
      type: String,
      trim: true,
      maxlength: 50
    }
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'under_review', 'approved', 'rejected', 'paid', 'cancelled'],
    default: 'draft'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  receipts: [receiptSchema],
  approvalHistory: [approvalHistorySchema],
  paymentDetails: paymentDetailsSchema,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: 500
  },
  paidAt: {
    type: Date
  },
  dueDate: {
    type: Date
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 30
  }],
  projectCode: {
    type: String,
    trim: true,
    maxlength: 50
  },
  clientName: {
    type: String,
    trim: true,
    maxlength: 100
  },
  billable: {
    type: Boolean,
    default: false
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringFrequency: {
    type: String,
    enum: ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually'],
    sparse: true
  },
  parentClaimId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reimbursement',
    sparse: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  internalNotes: {
    type: String,
    trim: true,
    maxlength: 1000
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

// Virtual: Calculate days since submission
reimbursementSchema.virtual('daysSinceSubmission').get(function() {
  if (!this.submissionDate) return 0;
  const diff = new Date() - this.submissionDate;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
});

// Virtual: Calculate days until due date
reimbursementSchema.virtual('daysUntilDue').get(function() {
  if (!this.dueDate) return null;
  const diff = this.dueDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Virtual: Check if claim is overdue
reimbursementSchema.virtual('isOverdue').get(function() {
  if (this.status === 'paid' || this.status === 'cancelled' || !this.dueDate) {
    return false;
  }
  return new Date() > this.dueDate;
});

// Virtual: Get current approver (if under review)
reimbursementSchema.virtual('currentApprover').get(function() {
  if (this.status === 'under_review' && this.approvalHistory.length > 0) {
    const lastApproval = this.approvalHistory[this.approvalHistory.length - 1];
    return lastApproval.changedBy;
  }
  return null;
});

// Pre-save middleware to generate claim number
reimbursementSchema.pre('save', async function(next) {
  if (!this.claimNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    this.claimNumber = `RMB-${year}${month}-${random}`;
  }
  next();
});

// Indexes for performance
reimbursementSchema.index({ user: 1, status: 1 });
reimbursementSchema.index({ user: 1, category: 1 });
reimbursementSchema.index({ user: 1, expenseDate: -1 });
reimbursementSchema.index({ user: 1, submissionDate: -1 });
reimbursementSchema.index({ claimNumber: 1 }, { unique: true });
reimbursementSchema.index({ status: 1, dueDate: 1 });
reimbursementSchema.index({ 'payee.employeeId': 1 });
reimbursementSchema.index({ tags: 1 });

module.exports = mongoose.model('Reimbursement', reimbursementSchema);
