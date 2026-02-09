const mongoose = require('mongoose');

const taxConfigSchema = new mongoose.Schema({
  country: {
    type: String,
    required: true,
    uppercase: true
  },
  region: {
    type: String,
    uppercase: true
  },
  taxRules: [{
    category: {
      type: String,
      required: true
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    type: {
      type: String,
      enum: ['VAT', 'GST', 'SALES_TAX', 'INCOME_TAX', 'DEDUCTIBLE'],
      required: true
    },
    threshold: {
      amount: Number,
      currency: String
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  currency: {
    type: String,
    required: true,
    uppercase: true
  },
  fiscalYearStart: {
    month: {
      type: Number,
      min: 1,
      max: 12,
      default: 1
    },
    day: {
      type: Number,
      min: 1,
      max: 31,
      default: 1
    }
  }
}, {
  timestamps: true
});

taxConfigSchema.index({ country: 1, region: 1 });
taxConfigSchema.index({ currency: 1 });

module.exports = mongoose.model('TaxConfig', taxConfigSchema);