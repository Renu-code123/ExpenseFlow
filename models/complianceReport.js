// Compliance Report Model
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ComplianceReportSchema = new Schema({
  type: { type: String, enum: ['GDPR', 'PCI DSS', 'SOX'], required: true },
  userId: { type: String },
  data: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ComplianceReport', ComplianceReportSchema);
