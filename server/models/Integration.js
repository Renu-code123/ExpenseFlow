const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['bank', 'accounting', 'payment', 'erp'], required: true },
  provider: { type: String, required: true }, // quickbooks, xero, stripe, etc
  status: { type: String, enum: ['active', 'inactive', 'error'], default: 'inactive' },
  credentials: {
    accessToken: String,
    refreshToken: String,
    apiKey: String,
    clientId: String,
    expiresAt: Date
  },
  settings: {
    syncFrequency: { type: String, default: 'daily' },
    autoSync: { type: Boolean, default: true },
    categories: [String]
  },
  lastSync: Date,
  syncCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Integration', integrationSchema);