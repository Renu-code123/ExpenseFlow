const mongoose = require('mongoose');

const taxCategoryMappingSchema = new mongoose.Schema({
  expenseCategory: {
    type: String,
    required: true
  },
  taxCategory: {
    type: String,
    required: true
  },
  deductionCode: {
    type: String,
    trim: true
  },
  deductiblePercentage: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  }
}, { _id: false });

const taxCategorySchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['deductible', 'non_deductible', 'partially_deductible', 'income', 'exempt']
  },
  country: {
    type: String,
    required: true,
    default: 'IN',
    uppercase: true
  },
  applicableTo: [{
    type: String,
    enum: ['individual', 'business', 'self_employed', 'all']
  }],
  categoryMappings: [taxCategoryMappingSchema],
  maxDeductionLimit: {
    type: Number,
    default: null
  },
  requiresDocumentation: {
    type: Boolean,
    default: true
  },
  section: {
    type: String,
    trim: true
  },
  keywords: [{
    type: String,
    lowercase: true
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
taxCategorySchema.index({ code: 1, country: 1 });
taxCategorySchema.index({ type: 1, country: 1 });
taxCategorySchema.index({ keywords: 1 });

// Static method to get default tax categories
taxCategorySchema.statics.getDefaultCategories = function(country = 'IN') {
  const categories = [
    // Indian Tax Categories
    {
      code: 'BUSINESS_EXPENSE',
      name: 'Business Expenses',
      description: 'Expenses incurred for business operations',
      type: 'deductible',
      country: 'IN',
      applicableTo: ['business', 'self_employed'],
      section: '37(1)',
      keywords: ['business', 'office', 'supplies', 'equipment'],
      categoryMappings: [
        { expenseCategory: 'utilities', taxCategory: 'BUSINESS_EXPENSE', deductionCode: '37', deductiblePercentage: 100 },
        { expenseCategory: 'transport', taxCategory: 'BUSINESS_EXPENSE', deductionCode: '37', deductiblePercentage: 50 }
      ]
    },
    {
      code: 'MEDICAL_EXPENSE',
      name: 'Medical Expenses',
      description: 'Healthcare and medical treatment costs',
      type: 'deductible',
      country: 'IN',
      applicableTo: ['all'],
      section: '80D/80DDB',
      maxDeductionLimit: 100000,
      keywords: ['medical', 'health', 'hospital', 'medicine', 'doctor', 'healthcare'],
      categoryMappings: [
        { expenseCategory: 'healthcare', taxCategory: 'MEDICAL_EXPENSE', deductionCode: '80D', deductiblePercentage: 100 }
      ]
    },
    {
      code: 'EDUCATION_EXPENSE',
      name: 'Education Expenses',
      description: 'Educational and professional development costs',
      type: 'deductible',
      country: 'IN',
      applicableTo: ['all'],
      section: '80E',
      keywords: ['education', 'tuition', 'course', 'training', 'school', 'college'],
      categoryMappings: [
        { expenseCategory: 'other', taxCategory: 'EDUCATION_EXPENSE', deductionCode: '80E', deductiblePercentage: 100 }
      ]
    },
    {
      code: 'CHARITABLE_DONATION',
      name: 'Charitable Donations',
      description: 'Donations to approved charitable organizations',
      type: 'deductible',
      country: 'IN',
      applicableTo: ['all'],
      section: '80G',
      keywords: ['donation', 'charity', 'ngo', 'trust', 'foundation'],
      categoryMappings: [
        { expenseCategory: 'other', taxCategory: 'CHARITABLE_DONATION', deductionCode: '80G', deductiblePercentage: 50 }
      ]
    },
    {
      code: 'HOME_OFFICE',
      name: 'Home Office Expenses',
      description: 'Expenses for home-based work setup',
      type: 'partially_deductible',
      country: 'IN',
      applicableTo: ['self_employed', 'business'],
      section: '37(1)',
      keywords: ['home office', 'work from home', 'internet', 'furniture'],
      categoryMappings: [
        { expenseCategory: 'utilities', taxCategory: 'HOME_OFFICE', deductionCode: '37', deductiblePercentage: 40 }
      ]
    },
    {
      code: 'TRAVEL_BUSINESS',
      name: 'Business Travel',
      description: 'Travel expenses for business purposes',
      type: 'deductible',
      country: 'IN',
      applicableTo: ['business', 'self_employed'],
      section: '37(1)',
      keywords: ['travel', 'flight', 'hotel', 'business trip', 'conference'],
      categoryMappings: [
        { expenseCategory: 'transport', taxCategory: 'TRAVEL_BUSINESS', deductionCode: '37', deductiblePercentage: 100 }
      ]
    },
    {
      code: 'PERSONAL_EXPENSE',
      name: 'Personal Expenses',
      description: 'Non-deductible personal expenses',
      type: 'non_deductible',
      country: 'IN',
      applicableTo: ['all'],
      keywords: ['personal', 'food', 'entertainment', 'shopping'],
      categoryMappings: [
        { expenseCategory: 'food', taxCategory: 'PERSONAL_EXPENSE', deductionCode: null, deductiblePercentage: 0 },
        { expenseCategory: 'entertainment', taxCategory: 'PERSONAL_EXPENSE', deductionCode: null, deductiblePercentage: 0 },
        { expenseCategory: 'shopping', taxCategory: 'PERSONAL_EXPENSE', deductionCode: null, deductiblePercentage: 0 }
      ]
    },
    {
      code: 'INSURANCE_PREMIUM',
      name: 'Insurance Premiums',
      description: 'Life and health insurance premiums',
      type: 'deductible',
      country: 'IN',
      applicableTo: ['all'],
      section: '80C/80D',
      maxDeductionLimit: 150000,
      keywords: ['insurance', 'premium', 'life insurance', 'health insurance'],
      categoryMappings: []
    },
    // US Tax Categories
    {
      code: 'US_BUSINESS_EXPENSE',
      name: 'Business Expenses',
      description: 'Ordinary and necessary business expenses',
      type: 'deductible',
      country: 'US',
      applicableTo: ['business', 'self_employed'],
      keywords: ['business', 'office', 'supplies'],
      categoryMappings: [
        { expenseCategory: 'utilities', taxCategory: 'US_BUSINESS_EXPENSE', deductiblePercentage: 100 }
      ]
    },
    {
      code: 'US_MEDICAL',
      name: 'Medical Expenses',
      description: 'Medical expenses exceeding 7.5% of AGI',
      type: 'partially_deductible',
      country: 'US',
      applicableTo: ['all'],
      keywords: ['medical', 'health', 'doctor', 'hospital'],
      categoryMappings: [
        { expenseCategory: 'healthcare', taxCategory: 'US_MEDICAL', deductiblePercentage: 100 }
      ]
    },
    {
      code: 'US_CHARITY',
      name: 'Charitable Contributions',
      description: 'Donations to qualified organizations',
      type: 'deductible',
      country: 'US',
      applicableTo: ['all'],
      keywords: ['charity', 'donation', 'nonprofit'],
      categoryMappings: []
    }
  ];
  
  return categories.filter(c => c.country === country || country === 'ALL');
};

// Method to match expense to tax category
taxCategorySchema.statics.findMatchingCategory = async function(expense, country = 'IN') {
  const categories = await this.find({
    country: { $in: [country, 'ALL'] },
    isActive: true
  });
  
  let bestMatch = null;
  let highestConfidence = 0;
  
  for (const category of categories) {
    let confidence = 0;
    
    // Check expense category mapping
    const mapping = category.categoryMappings.find(
      m => m.expenseCategory === expense.category
    );
    if (mapping) {
      confidence += (mapping.deductiblePercentage / 100) * 0.4;
    }
    
    // Check keywords in description
    const description = (expense.description || '').toLowerCase();
    const merchant = (expense.merchant || '').toLowerCase();
    
    for (const keyword of category.keywords) {
      if (description.includes(keyword.toLowerCase()) || merchant.includes(keyword.toLowerCase())) {
        confidence += 0.2;
      }
    }
    
    if (confidence > highestConfidence) {
      highestConfidence = confidence;
      bestMatch = { category, confidence: Math.min(confidence, 1) };
    }
  }
  
  return bestMatch;
};

module.exports = mongoose.model('TaxCategory', taxCategorySchema);
