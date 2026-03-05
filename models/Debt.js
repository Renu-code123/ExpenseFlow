const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  principalPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  interestPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'check', 'bank_transfer', 'credit_card', 'debit_card', 'auto_draft', 'other'],
    default: 'bank_transfer'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  isExtraPayment: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const debtSchema = new mongoose.Schema({
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
  lender: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  loanType: {
    type: String,
    enum: ['personal', 'mortgage', 'auto', 'student', 'credit_card', 'home_equity', 'business', 'medical', 'other'],
    required: true,
    default: 'personal'
  },
  principalAmount: {
    type: Number,
    required: true,
    min: 0.01
  },
  currentBalance: {
    type: Number,
    required: true,
    min: 0
  },
  interestRate: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  interestType: {
    type: String,
    enum: ['simple', 'compound'],
    default: 'compound'
  },
  compoundingFrequency: {
    type: String,
    enum: ['daily', 'monthly', 'quarterly', 'annually'],
    default: 'monthly'
  },
  monthlyPayment: {
    type: Number,
    required: true,
    min: 0.01
  },
  minimumPayment: {
    type: Number,
    min: 0.01
  },
  startDate: {
    type: Date,
    required: true
  },
  maturityDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'paid_off', 'defaulted', 'refinanced', 'in_grace_period'],
    default: 'active'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  payments: [paymentSchema],
  totalPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  totalInterestPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  lastPaymentDate: {
    type: Date
  },
  nextPaymentDate: {
    type: Date
  },
  reminderDays: {
    type: Number,
    default: 3,
    min: 0,
    max: 30
  },
  isAutoPay: {
    type: Boolean,
    default: false
  },
  accountNumber: {
    type: String,
    trim: true,
    maxlength: 50
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 30
  }],
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

// Virtual: Calculate progress percentage
debtSchema.virtual('progressPercentage').get(function() {
  if (this.principalAmount === 0) return 0;
  const paid = this.principalAmount - this.currentBalance;
  return Math.min(Math.round((paid / this.principalAmount) * 100), 100);
});

// Virtual: Calculate remaining amount
debtSchema.virtual('remainingAmount').get(function() {
  return Math.max(0, this.currentBalance);
});

// Virtual: Calculate estimated payoff date
debtSchema.virtual('estimatedPayoffDate').get(function() {
  if (this.currentBalance <= 0 || this.monthlyPayment <= 0) {
    return this.status === 'paid_off' ? this.lastPaymentDate : null;
  }
  
  const monthlyInterestRate = (this.interestRate / 100) / 12;
  let remainingBalance = this.currentBalance;
  let months = 0;
  const maxMonths = 600; // 50 years cap
  
  while (remainingBalance > 0 && months < maxMonths) {
    const interest = remainingBalance * monthlyInterestRate;
    const principal = Math.min(this.monthlyPayment - interest, remainingBalance);
    
    if (principal <= 0) break; // Can't pay off with this payment amount
    
    remainingBalance -= principal;
    months++;
  }
  
  const payoffDate = new Date();
  payoffDate.setMonth(payoffDate.getMonth() + months);
  return payoffDate;
});

// Virtual: Calculate months remaining
debtSchema.virtual('monthsRemaining').get(function() {
  if (this.currentBalance <= 0) return 0;
  
  const monthlyInterestRate = (this.interestRate / 100) / 12;
  let remainingBalance = this.currentBalance;
  let months = 0;
  const maxMonths = 600;
  
  while (remainingBalance > 0 && months < maxMonths) {
    const interest = remainingBalance * monthlyInterestRate;
    const principal = Math.min(this.monthlyPayment - interest, remainingBalance);
    
    if (principal <= 0) break;
    
    remainingBalance -= principal;
    months++;
  }
  
  return months;
});

// Virtual: Calculate total interest to be paid
debtSchema.virtual('totalInterestProjected').get(function() {
  if (this.currentBalance <= 0) return this.totalInterestPaid;
  
  const monthlyInterestRate = (this.interestRate / 100) / 12;
  let remainingBalance = this.currentBalance;
  let totalInterest = 0;
  let months = 0;
  const maxMonths = 600;
  
  while (remainingBalance > 0 && months < maxMonths) {
    const interest = remainingBalance * monthlyInterestRate;
    const principal = Math.min(this.monthlyPayment - interest, remainingBalance);
    
    if (principal <= 0) break;
    
    totalInterest += interest;
    remainingBalance -= principal;
    months++;
  }
  
  return Math.round((this.totalInterestPaid + totalInterest) * 100) / 100;
});

// Virtual: Check if payment is overdue
debtSchema.virtual('isOverdue').get(function() {
  if (this.status !== 'active' || !this.nextPaymentDate) return false;
  return new Date() > this.nextPaymentDate;
});

// Virtual: Days until next payment
debtSchema.virtual('daysUntilPayment').get(function() {
  if (!this.nextPaymentDate || this.status !== 'active') return null;
  const diff = this.nextPaymentDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Indexes for performance
debtSchema.index({ user: 1, status: 1 });
debtSchema.index({ user: 1, loanType: 1 });
debtSchema.index({ user: 1, nextPaymentDate: 1 });
debtSchema.index({ user: 1, priority: 1 });

// Pre-save middleware to update status if balance is 0
debtSchema.pre('save', function(next) {
  if (this.currentBalance <= 0 && this.status === 'active') {
    this.status = 'paid_off';
    if (!this.lastPaymentDate) {
      this.lastPaymentDate = new Date();
    }
  }
  next();
});

module.exports = mongoose.model('Debt', debtSchema);
