const mongoose = require('mongoose');

const reportSectionSchema = new mongoose.Schema({
  title: String,
  data: mongoose.Schema.Types.Mixed,
  chartType: {
    type: String,
    enum: ['bar', 'pie', 'line', 'table', 'summary', 'none']
  }
}, { _id: false });

const financialReportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportType: {
    type: String,
    required: true,
    enum: [
      'income_statement',
      'profit_loss',
      'expense_summary',
      'tax_summary',
      'monthly_report',
      'quarterly_report',
      'annual_report',
      'custom'
    ]
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  dateRange: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    }
  },
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
    default: 'monthly'
  },
  currency: {
    type: String,
    default: 'INR',
    uppercase: true
  },
  summary: {
    totalIncome: {
      type: Number,
      default: 0
    },
    totalExpenses: {
      type: Number,
      default: 0
    },
    netAmount: {
      type: Number,
      default: 0
    },
    savingsRate: {
      type: Number,
      default: 0
    },
    taxableIncome: {
      type: Number,
      default: 0
    },
    estimatedTax: {
      type: Number,
      default: 0
    },
    deductibleExpenses: {
      type: Number,
      default: 0
    }
  },
  incomeBreakdown: [{
    category: String,
    amount: Number,
    percentage: Number,
    count: Number
  }],
  expenseBreakdown: [{
    category: String,
    amount: Number,
    percentage: Number,
    count: Number,
    taxDeductible: Boolean,
    deductibleAmount: Number
  }],
  monthlyTrends: [{
    month: String,
    year: Number,
    income: Number,
    expenses: Number,
    net: Number
  }],
  taxDeductions: [{
    section: String,
    name: String,
    amount: Number,
    maxLimit: Number,
    utilized: Number
  }],
  topExpenses: [{
    description: String,
    amount: Number,
    category: String,
    date: Date
  }],
  sections: [reportSectionSchema],
  metadata: {
    generatedAt: {
      type: Date,
      default: Date.now
    },
    generationTime: Number, // in milliseconds
    expenseCount: Number,
    incomeCount: Number,
    version: {
      type: String,
      default: '1.0'
    }
  },
  pdfUrl: {
    type: String,
    default: null
  },
  pdfGeneratedAt: Date,
  isArchived: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Indexes
financialReportSchema.index({ user: 1, reportType: 1, createdAt: -1 });
financialReportSchema.index({ user: 1, 'dateRange.startDate': 1, 'dateRange.endDate': 1 });
financialReportSchema.index({ user: 1, isArchived: 1 });

// Virtual for formatted date range
financialReportSchema.virtual('formattedDateRange').get(function() {
  const start = this.dateRange.startDate.toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric', year: 'numeric' 
  });
  const end = this.dateRange.endDate.toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric', year: 'numeric' 
  });
  return `${start} - ${end}`;
});

// Method to calculate health score
financialReportSchema.methods.calculateHealthScore = function() {
  const savingsRate = this.summary.savingsRate;
  const expenseRatio = this.summary.totalIncome > 0 
    ? (this.summary.totalExpenses / this.summary.totalIncome) * 100 
    : 100;
  
  let score = 50; // Base score
  
  // Savings rate contribution (up to 30 points)
  if (savingsRate >= 30) score += 30;
  else if (savingsRate >= 20) score += 25;
  else if (savingsRate >= 10) score += 15;
  else if (savingsRate > 0) score += 5;
  
  // Expense ratio contribution (up to 20 points)
  if (expenseRatio <= 50) score += 20;
  else if (expenseRatio <= 70) score += 15;
  else if (expenseRatio <= 90) score += 10;
  else if (expenseRatio <= 100) score += 5;
  
  return Math.min(100, Math.max(0, score));
};

module.exports = mongoose.model('FinancialReport', financialReportSchema);
