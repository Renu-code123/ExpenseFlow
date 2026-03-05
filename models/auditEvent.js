// Audit Event Model
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AuditEventSchema = new Schema({
  userId: { type: String },
  type: { type: String },
  details: { type: Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AuditEvent', AuditEventSchema);
