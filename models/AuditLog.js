const mongoose = require('mongoose');

/**
 * AuditLog Model
 * Issue #731: High-volume polymorphic storage for system-wide forensic auditing.
 */
const auditLogSchema = new mongoose.Schema({
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  entityModel: {
    type: String,
    required: true,
    enum: ['Transaction', 'Taxonomy', 'Workspace', 'User', 'Budget'],
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: ['create', 'update', 'delete', 'restore'],
    index: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Could be system-generated
    index: true
  },
  changes: {
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    diff: { type: mongoose.Schema.Types.Mixed }
  },
  metadata: {
    ip: String,
    userAgent: String,
    requestId: String,
    source: { type: String, default: 'web' }
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false, // We use our own timestamp
  autoIndex: true
});

// Compound indexes for forensic searches
auditLogSchema.index({ entityModel: 1, entityId: 1, timestamp: -1 });
auditLogSchema.index({ performedBy: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);