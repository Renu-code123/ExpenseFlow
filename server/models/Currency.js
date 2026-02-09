const mongoose = require('mongoose');

const currencySchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    length: 3
  },
  name: {
    type: String,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  exchangeRates: {
    type: Map,
    of: {
      rate: Number,
      lastUpdated: Date
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  decimalPlaces: {
    type: Number,
    default: 2
  },
  countries: [String]
}, {
  timestamps: true
});

currencySchema.index({ code: 1 });
currencySchema.index({ isActive: 1 });

module.exports = mongoose.model('Currency', currencySchema);