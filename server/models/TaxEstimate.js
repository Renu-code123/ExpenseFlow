const mongoose = require('mongoose');

/**
 * Tax Estimate Schema
 * Stores calculated tax estimates and projections
 */
const taxEstimateSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  taxProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxProfile',
    required: true
  },
  
  // Tax year
  taxYear: {
    type: Number,
    required: true
  },
  
  // Estimate type
  estimateType: {
    type: String,
    enum: ['annual', 'quarterly', 'projection', 'what_if'],
    required: true
  },
  
  // Quarter (for quarterly estimates)
  quarter: {
    type: Number,
    min: 1,
    max: 4
  },
  
  // Income breakdown
  income: {
    wages: { type: Number, default: 0 },
    selfEmployment: { type: Number, default: 0 },
    freelance: { type: Number, default: 0 },
    investment: {
      dividends: { type: Number, default: 0 },
      qualifiedDividends: { type: Number, default: 0 },
      capitalGainsShortTerm: { type: Number, default: 0 },
      capitalGainsLongTerm: { type: Number, default: 0 },
      interest: { type: Number, default: 0 }
    },
    rental: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  
  // Pre-tax adjustments (above the line)
  adjustments: {
    hsaContribution: { type: Number, default: 0 },
    iraContribution: { type: Number, default: 0 },
    sepIraContribution: { type: Number, default: 0 },
    studentLoanInterest: { type: Number, default: 0 },
    selfEmploymentTax: { type: Number, default: 0 },
    healthInsurance: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  
  // Adjusted Gross Income
  agi: {
    type: Number,
    default: 0
  },
  
  // Deductions
  deductions: {
    type: {
      type: String,
      enum: ['standard', 'itemized'],
      default: 'standard'
    },
    standardDeduction: { type: Number, default: 0 },
    itemizedDeductions: {
      medicalDental: { type: Number, default: 0 },
      stateLocalTaxes: { type: Number, default: 0 },
      mortgageInterest: { type: Number, default: 0 },
      charitableContributions: { type: Number, default: 0 },
      casualtyLosses: { type: Number, default: 0 },
      miscellaneous: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    // Business deductions (Schedule C)
    businessDeductions: {
      advertising: { type: Number, default: 0 },
      carAndTruck: { type: Number, default: 0 },
      commissions: { type: Number, default: 0 },
      contractLabor: { type: Number, default: 0 },
      depreciation: { type: Number, default: 0 },
      insurance: { type: Number, default: 0 },
      interest: { type: Number, default: 0 },
      legalProfessional: { type: Number, default: 0 },
      officeExpense: { type: Number, default: 0 },
      rent: { type: Number, default: 0 },
      repairs: { type: Number, default: 0 },
      supplies: { type: Number, default: 0 },
      travel: { type: Number, default: 0 },
      meals: { type: Number, default: 0 },
      utilities: { type: Number, default: 0 },
      homeOffice: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    totalDeductions: { type: Number, default: 0 }
  },
  
  // Taxable income
  taxableIncome: {
    type: Number,
    default: 0
  },
  
  // Tax calculations
  taxCalculation: {
    federalIncomeTax: { type: Number, default: 0 },
    selfEmploymentTax: { type: Number, default: 0 },
    capitalGainsTax: { type: Number, default: 0 },
    stateIncomeTax: { type: Number, default: 0 },
    localTax: { type: Number, default: 0 },
    additionalMedicareTax: { type: Number, default: 0 },
    netInvestmentIncomeTax: { type: Number, default: 0 },
    totalTaxBeforeCredits: { type: Number, default: 0 }
  },
  
  // Tax credits
  credits: {
    childTaxCredit: { type: Number, default: 0 },
    earnedIncomeCredit: { type: Number, default: 0 },
    educationCredits: { type: Number, default: 0 },
    childcarCredit: { type: Number, default: 0 },
    foreignTaxCredit: { type: Number, default: 0 },
    retirementSaversCredit: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  
  // Final tax amounts
  finalTax: {
    totalTax: { type: Number, default: 0 },
    effectiveRate: { type: Number, default: 0 },
    marginalRate: { type: Number, default: 0 }
  },
  
  // Payments and withholdings
  payments: {
    federalWithholding: { type: Number, default: 0 },
    stateWithholding: { type: Number, default: 0 },
    estimatedPayments: {
      q1: { type: Number, default: 0 },
      q2: { type: Number, default: 0 },
      q3: { type: Number, default: 0 },
      q4: { type: Number, default: 0 }
    },
    totalPayments: { type: Number, default: 0 }
  },
  
  // Balance due or refund
  balance: {
    amount: { type: Number, default: 0 },
    isRefund: { type: Boolean, default: false }
  },
  
  // Quarterly estimated payment info
  quarterlyEstimates: {
    nextPaymentDue: Date,
    recommendedPayment: Number,
    safeHarborAmount: Number,
    annualizedIncome: Number
  },
  
  // Comparison data
  comparison: {
    previousYear: {
      totalTax: Number,
      effectiveRate: Number,
      refundOrOwed: Number
    },
    changeFromPrevious: {
      taxChange: Number,
      percentChange: Number
    }
  },
  
  // Optimization suggestions
  optimizations: [{
    type: {
      type: String,
      enum: [
        'increase_retirement',
        'maximize_hsa',
        'itemize_vs_standard',
        'bunch_deductions',
        'tax_loss_harvesting',
        'charitable_giving',
        'income_timing',
        'business_expense',
        'home_office',
        'mileage_tracking'
      ]
    },
    title: String,
    description: String,
    potentialSavings: Number,
    actionItems: [String],
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard']
    },
    deadline: Date
  }],
  
  // Breakdown by tax bracket
  bracketBreakdown: [{
    rate: Number,
    income: Number,
    tax: Number
  }],
  
  // Audit flags
  flags: [{
    type: { type: String },
    message: String,
    severity: { type: String, enum: ['info', 'warning', 'error'] }
  }],
  
  // What-if scenario details
  whatIfScenario: {
    name: String,
    description: String,
    baseEstimate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxEstimate'
    },
    changes: [{
      field: String,
      originalValue: Number,
      newValue: Number
    }]
  },
  
  // Calculation metadata
  calculatedAt: {
    type: Date,
    default: Date.now
  },
  
  calculationVersion: {
    type: String,
    default: '1.0'
  },
  
  dataCompleteness: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  isFinalized: {
    type: Boolean,
    default: false
  },
  
  notes: String
}, {
  timestamps: true
});

// Indexes
taxEstimateSchema.index({ user: 1, taxYear: 1 });
taxEstimateSchema.index({ user: 1, taxYear: 1, quarter: 1 });
taxEstimateSchema.index({ user: 1, estimateType: 1 });
taxEstimateSchema.index({ calculatedAt: -1 });

// Pre-save middleware to calculate totals
taxEstimateSchema.pre('save', function(next) {
  // Calculate income total
  this.income.total = 
    this.income.wages +
    this.income.selfEmployment +
    this.income.freelance +
    (this.income.investment.dividends || 0) +
    (this.income.investment.capitalGainsShortTerm || 0) +
    (this.income.investment.capitalGainsLongTerm || 0) +
    (this.income.investment.interest || 0) +
    this.income.rental +
    this.income.other;
  
  // Calculate adjustments total
  this.adjustments.total = 
    this.adjustments.hsaContribution +
    this.adjustments.iraContribution +
    this.adjustments.sepIraContribution +
    this.adjustments.studentLoanInterest +
    (this.adjustments.selfEmploymentTax * 0.5) + // Half of SE tax is deductible
    this.adjustments.healthInsurance +
    this.adjustments.other;
  
  // Calculate AGI
  this.agi = this.income.total - this.adjustments.total;
  
  // Calculate itemized deductions total
  this.deductions.itemizedDeductions.total =
    this.deductions.itemizedDeductions.medicalDental +
    this.deductions.itemizedDeductions.stateLocalTaxes +
    this.deductions.itemizedDeductions.mortgageInterest +
    this.deductions.itemizedDeductions.charitableContributions +
    this.deductions.itemizedDeductions.casualtyLosses +
    this.deductions.itemizedDeductions.miscellaneous;
  
  // Determine which deduction type to use
  if (this.deductions.itemizedDeductions.total > this.deductions.standardDeduction) {
    this.deductions.type = 'itemized';
    this.deductions.totalDeductions = this.deductions.itemizedDeductions.total;
  } else {
    this.deductions.type = 'standard';
    this.deductions.totalDeductions = this.deductions.standardDeduction;
  }
  
  // Add business deductions if applicable
  this.deductions.businessDeductions.total = Object.values(this.deductions.businessDeductions)
    .filter(v => typeof v === 'number' && !isNaN(v))
    .reduce((sum, val) => sum + val, 0) - this.deductions.businessDeductions.total;
  
  // Calculate taxable income
  this.taxableIncome = Math.max(0, this.agi - this.deductions.totalDeductions);
  
  // Calculate total tax before credits
  this.taxCalculation.totalTaxBeforeCredits =
    this.taxCalculation.federalIncomeTax +
    this.taxCalculation.selfEmploymentTax +
    this.taxCalculation.capitalGainsTax +
    this.taxCalculation.stateIncomeTax +
    this.taxCalculation.localTax +
    this.taxCalculation.additionalMedicareTax +
    this.taxCalculation.netInvestmentIncomeTax;
  
  // Calculate total credits
  this.credits.total = 
    this.credits.childTaxCredit +
    this.credits.earnedIncomeCredit +
    this.credits.educationCredits +
    this.credits.childcarCredit +
    this.credits.foreignTaxCredit +
    this.credits.retirementSaversCredit +
    this.credits.other;
  
  // Calculate final tax
  this.finalTax.totalTax = Math.max(0, this.taxCalculation.totalTaxBeforeCredits - this.credits.total);
  
  // Calculate effective rate
  this.finalTax.effectiveRate = this.income.total > 0 
    ? (this.finalTax.totalTax / this.income.total) * 100 
    : 0;
  
  // Calculate total payments
  this.payments.totalPayments = 
    this.payments.federalWithholding +
    this.payments.stateWithholding +
    this.payments.estimatedPayments.q1 +
    this.payments.estimatedPayments.q2 +
    this.payments.estimatedPayments.q3 +
    this.payments.estimatedPayments.q4;
  
  // Calculate balance
  this.balance.amount = this.payments.totalPayments - this.finalTax.totalTax;
  this.balance.isRefund = this.balance.amount > 0;
  
  next();
});

// Method to calculate federal income tax
taxEstimateSchema.methods.calculateFederalTax = function(taxableIncome, filingStatus) {
  const brackets = {
    single: [
      { min: 0, max: 11600, rate: 0.10 },
      { min: 11600, max: 47150, rate: 0.12 },
      { min: 47150, max: 100525, rate: 0.22 },
      { min: 100525, max: 191950, rate: 0.24 },
      { min: 191950, max: 243725, rate: 0.32 },
      { min: 243725, max: 609350, rate: 0.35 },
      { min: 609350, max: Infinity, rate: 0.37 }
    ],
    married_filing_jointly: [
      { min: 0, max: 23200, rate: 0.10 },
      { min: 23200, max: 94300, rate: 0.12 },
      { min: 94300, max: 201050, rate: 0.22 },
      { min: 201050, max: 383900, rate: 0.24 },
      { min: 383900, max: 487450, rate: 0.32 },
      { min: 487450, max: 731200, rate: 0.35 },
      { min: 731200, max: Infinity, rate: 0.37 }
    ]
  };
  
  const statusBrackets = brackets[filingStatus] || brackets.single;
  let tax = 0;
  this.bracketBreakdown = [];
  
  for (const bracket of statusBrackets) {
    if (taxableIncome > bracket.min) {
      const taxableInBracket = Math.min(taxableIncome, bracket.max) - bracket.min;
      const taxInBracket = taxableInBracket * bracket.rate;
      tax += taxInBracket;
      
      if (taxableInBracket > 0) {
        this.bracketBreakdown.push({
          rate: bracket.rate * 100,
          income: taxableInBracket,
          tax: taxInBracket
        });
        
        // Set marginal rate
        this.finalTax.marginalRate = bracket.rate * 100;
      }
    }
  }
  
  return tax;
};

// Method to calculate self-employment tax
taxEstimateSchema.methods.calculateSelfEmploymentTax = function(selfEmploymentIncome) {
  if (selfEmploymentIncome <= 0) return 0;
  
  const netEarnings = selfEmploymentIncome * 0.9235; // 92.35% of SE income
  const socialSecurityBase = Math.min(netEarnings, 168600); // 2024 SS wage base
  const socialSecurityTax = socialSecurityBase * 0.124;
  const medicareTax = netEarnings * 0.029;
  const additionalMedicare = Math.max(0, netEarnings - 200000) * 0.009;
  
  return socialSecurityTax + medicareTax + additionalMedicare;
};

// Static method to get latest estimate for user
taxEstimateSchema.statics.getLatestEstimate = async function(userId, taxYear) {
  return this.findOne({
    user: userId,
    taxYear,
    estimateType: 'annual'
  }).sort({ calculatedAt: -1 });
};

// Static method to compare years
taxEstimateSchema.statics.compareYears = async function(userId, year1, year2) {
  const [estimate1, estimate2] = await Promise.all([
    this.getLatestEstimate(userId, year1),
    this.getLatestEstimate(userId, year2)
  ]);
  
  if (!estimate1 || !estimate2) return null;
  
  return {
    year1: { year: year1, ...estimate1.toObject() },
    year2: { year: year2, ...estimate2.toObject() },
    changes: {
      incomeChange: estimate2.income.total - estimate1.income.total,
      taxChange: estimate2.finalTax.totalTax - estimate1.finalTax.totalTax,
      effectiveRateChange: estimate2.finalTax.effectiveRate - estimate1.finalTax.effectiveRate,
      deductionChange: estimate2.deductions.totalDeductions - estimate1.deductions.totalDeductions
    }
  };
};

module.exports = mongoose.model('TaxEstimate', taxEstimateSchema);
