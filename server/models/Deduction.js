const mongoose = require('mongoose');

/**
 * Deduction Schema
 * Tracks individual tax-deductible expenses and their documentation
 */
const deductionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Tax year this deduction applies to
  taxYear: {
    type: Number,
    required: true,
    default: () => new Date().getFullYear()
  },
  
  // Link to tax category
  taxCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxCategory',
    required: true
  },
  
  // Link to original expense (if applicable)
  expense: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  },
  
  // Deduction details
  description: {
    type: String,
    required: true,
    trim: true
  },
  
  merchant: {
    type: String,
    trim: true
  },
  
  // Amount claimed
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Currency
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  
  // Original amount if different currency
  originalAmount: Number,
  originalCurrency: String,
  exchangeRate: Number,
  
  // Deductible percentage (e.g., business meals at 50%)
  deductiblePercentage: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  },
  
  // Calculated deductible amount
  deductibleAmount: {
    type: Number,
    default: function() {
      return this.amount * (this.deductiblePercentage / 100);
    }
  },
  
  // Date of expense
  date: {
    type: Date,
    required: true
  },
  
  // Business purpose (required for business deductions)
  businessPurpose: {
    type: String,
    trim: true
  },
  
  // For mileage tracking
  mileage: {
    miles: Number,
    ratePerMile: Number, // IRS standard rate
    startLocation: String,
    endLocation: String,
    roundTrip: Boolean
  },
  
  // For home office deductions
  homeOffice: {
    squareFootage: Number,
    method: { type: String, enum: ['simplified', 'regular'] }
  },
  
  // For meals with clients
  mealDetails: {
    attendees: [String],
    businessDiscussion: String,
    restaurantName: String
  },
  
  // Documentation and receipts
  documentation: {
    hasReceipt: { type: Boolean, default: false },
    receiptUrls: [String],
    additionalDocs: [{
      type: { type: String },
      url: String,
      description: String
    }]
  },
  
  // AI categorization info
  aiCategorization: {
    suggestedCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxCategory'
    },
    confidence: Number,
    userOverride: Boolean,
    categorizedAt: Date
  },
  
  // Verification status
  status: {
    type: String,
    enum: ['pending', 'verified', 'flagged', 'rejected', 'needs_documentation'],
    default: 'pending'
  },
  
  // Verification details
  verification: {
    verifiedAt: Date,
    verifiedBy: String, // 'user', 'ai', 'accountant'
    notes: String,
    flags: [{
      type: { type: String },
      message: String,
      createdAt: { type: Date, default: Date.now }
    }]
  },
  
  // Audit trail
  auditLog: [{
    action: String,
    previousValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    changedBy: String,
    changedAt: { type: Date, default: Date.now },
    reason: String
  }],
  
  // Form mapping - which tax form line this maps to
  formMapping: {
    form: String,
    line: String,
    schedule: String
  },
  
  // Tags for organization
  tags: [String],
  
  // Notes
  notes: String,
  
  // Quarterly assignment (for estimated taxes)
  quarter: {
    type: Number,
    min: 1,
    max: 4
  },
  
  // Recurring deduction tracking
  isRecurring: {
    type: Boolean,
    default: false
  },
  
  recurringInfo: {
    frequency: {
      type: String,
      enum: ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually']
    },
    parentDeduction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deduction'
    }
  },
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false
  },
  
  deletedAt: Date,
  deletedReason: String
}, {
  timestamps: true
});

// Indexes
deductionSchema.index({ user: 1, taxYear: 1 });
deductionSchema.index({ user: 1, taxCategory: 1 });
deductionSchema.index({ user: 1, date: -1 });
deductionSchema.index({ user: 1, status: 1 });
deductionSchema.index({ expense: 1 });
deductionSchema.index({ 'documentation.hasReceipt': 1 });

// Pre-save middleware to calculate deductible amount
deductionSchema.pre('save', function(next) {
  this.deductibleAmount = this.amount * (this.deductiblePercentage / 100);
  
  // Calculate mileage amount if applicable
  if (this.mileage && this.mileage.miles && this.mileage.ratePerMile) {
    this.amount = this.mileage.miles * this.mileage.ratePerMile;
    this.deductibleAmount = this.amount;
  }
  
  // Determine quarter based on date
  if (this.date) {
    const month = this.date.getMonth();
    if (month <= 2) this.quarter = 1;
    else if (month <= 5) this.quarter = 2;
    else if (month <= 8) this.quarter = 3;
    else this.quarter = 4;
  }
  
  next();
});

// Virtual for formatted amount
deductionSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: this.currency
  }).format(this.deductibleAmount);
});

// Method to add audit log entry
deductionSchema.methods.addAuditEntry = function(action, previousValue, newValue, changedBy, reason) {
  this.auditLog.push({
    action,
    previousValue,
    newValue,
    changedBy,
    reason,
    changedAt: new Date()
  });
};

// Method to flag deduction
deductionSchema.methods.flag = function(flagType, message) {
  this.status = 'flagged';
  this.verification.flags.push({
    type: flagType,
    message,
    createdAt: new Date()
  });
};

// Static method to get deductions summary by category
deductionSchema.statics.getSummaryByCategory = async function(userId, taxYear) {
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        taxYear,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: '$taxCategory',
        totalAmount: { $sum: '$amount' },
        totalDeductible: { $sum: '$deductibleAmount' },
        count: { $sum: 1 },
        withReceipts: {
          $sum: { $cond: ['$documentation.hasReceipt', 1, 0] }
        }
      }
    },
    {
      $lookup: {
        from: 'taxcategories',
        localField: '_id',
        foreignField: '_id',
        as: 'category'
      }
    },
    {
      $unwind: '$category'
    },
    {
      $project: {
        category: '$category.name',
        categoryCode: '$category.code',
        totalAmount: 1,
        totalDeductible: 1,
        count: 1,
        withReceipts: 1,
        receiptPercentage: {
          $multiply: [{ $divide: ['$withReceipts', '$count'] }, 100]
        }
      }
    },
    { $sort: { totalDeductible: -1 } }
  ]);
};

// Static method to get quarterly totals
deductionSchema.statics.getQuarterlyTotals = async function(userId, taxYear) {
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        taxYear,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: '$quarter',
        totalAmount: { $sum: '$amount' },
        totalDeductible: { $sum: '$deductibleAmount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

// Static method to find deductions missing documentation
deductionSchema.statics.findMissingDocumentation = async function(userId, taxYear) {
  return this.find({
    user: userId,
    taxYear,
    isDeleted: false,
    'documentation.hasReceipt': false,
    amount: { $gte: 75 } // IRS requires receipts for $75+
  }).populate('taxCategory', 'name documentation');
};

// Static method to get form-ready data
deductionSchema.statics.getFormData = async function(userId, taxYear, form) {
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        taxYear,
        isDeleted: false,
        'formMapping.form': form
      }
    },
    {
      $group: {
        _id: '$formMapping.line',
        totalAmount: { $sum: '$deductibleAmount' },
        items: { $push: { description: '$description', amount: '$deductibleAmount' } }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

module.exports = mongoose.model('Deduction', deductionSchema);
