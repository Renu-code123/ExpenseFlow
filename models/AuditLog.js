const mongoose = require('mongoose');

/**
 * AuditLog Model
 * Immutable audit trail records with cryptographic integrity verification
 */
const auditLogSchema = new mongoose.Schema({
  logId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userName: String,
  userEmail: String,
  action: {
    type: String,
    required: true,
    enum: ['create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'import', 'approve', 'reject'],
    index: true
  },
  entityType: {
    type: String,
    required: true,
    index: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  entityName: String,
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    fields: [String]
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    requestId: String,
    sessionId: String,
    apiEndpoint: String,
    httpMethod: String,
    statusCode: Number
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  category: {
    type: String,
    enum: ['security', 'data', 'system', 'compliance', 'user_action'],
    default: 'user_action',
    index: true
  },
  tags: [String],
  hash: {
    type: String,
    required: true
  },
  previousHash: String,
  isCompressed: {
    type: Boolean,
    default: false
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  retentionDate: Date
}, {
  timestamps: false,
  strict: true
});

// Prevent modifications after creation (immutable)
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('Audit logs are immutable and cannot be modified'));
  }
  next();
});

// Prevent updates
auditLogSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('Audit logs cannot be updated'));
});

// Prevent deletions (only archival allowed)
auditLogSchema.pre('remove', function (next) {
  next(new Error('Audit logs cannot be deleted'));
});

// Indexes for efficient querying
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ category: 1, severity: 1, timestamp: -1 });
auditLogSchema.index({ tags: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);