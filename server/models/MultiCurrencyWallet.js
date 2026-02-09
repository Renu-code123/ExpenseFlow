const mongoose = require('mongoose');

const multiCurrencyWalletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  balances: [{
    currency: {
      type: String,
      required: true,
      uppercase: true
    },
    amount: {
      type: Number,
      required: true,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }],
  primaryCurrency: {
    type: String,
    required: true,
    uppercase: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  bankDetails: {
    accountNumber: String,
    routingNumber: String,
    swiftCode: String,
    iban: String,
    bankName: String,
    country: String
  }
}, {
  timestamps: true
});

multiCurrencyWalletSchema.index({ userId: 1 });
multiCurrencyWalletSchema.index({ userId: 1, isDefault: 1 });

module.exports = mongoose.model('MultiCurrencyWallet', multiCurrencyWalletSchema);