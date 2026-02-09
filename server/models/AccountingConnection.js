const mongoose = require('mongoose');

const accountingConnectionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platform: { type: String, enum: ['quickbooks', 'xero'], required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  realmId: { type: String }, // For QuickBooks company ID
  tenantId: { type: String }, // For Xero tenant ID
  expiresAt: { type: Date, required: true },
  connectedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AccountingConnection', accountingConnectionSchema);