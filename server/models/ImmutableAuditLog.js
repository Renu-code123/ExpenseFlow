const mongoose = require('mongoose');
const crypto = require('crypto');

const immutableAuditLogSchema = new mongoose.Schema({
  sequenceNumber: {
    type: Number,
    required: true,
    unique: true
  },
  previousHash: {
    type: String,
    required: true
  },
  currentHash: {
    type: String,
    required: true,
    unique: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'expense_created', 'expense_updated', 'expense_deleted', 'expense_approved', 'expense_rejected',
      'budget_created', 'budget_updated', 'budget_deleted', 'budget_exceeded',
      'user_login', 'user_logout', 'user_created', 'user_updated', 'user_deleted',
      'workspace_created', 'workspace_updated', 'workspace_deleted',
      'compliance_violation', 'data_export', 'data_import', 'system_config_changed',
      'payment_processed', 'refund_issued', 'tax_calculated', 'report_generated'
    ]
  },
  entityType: {
    type: String,
    required: true,
    enum: ['expense', 'budget', 'user', 'workspace', 'payment', 'report', 'system']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    sessionId: String,
    apiEndpoint: String,
    requestId: String,
    geolocation: {
      country: String,
      region: String,
      city: String
    },
    deviceInfo: {
      type: String,
      os: String,
      browser: String
    }
  },
  complianceFlags: [{
    standard: {
      type: String,
      enum: ['SOX', 'GDPR', 'PCI_DSS', 'HIPAA', 'SOC2', 'ISO27001']
    },
    requirement: String,
    status: {
      type: String,
      enum: ['compliant', 'violation', 'warning', 'review_required']
    },
    details: String
  }],
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  retentionPolicy: {
    retainUntil: Date,
    legalHold: {
      type: Boolean,
      default: false
    },
    holdReason: String,
    holdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  signature: {
    type: String,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

immutableAuditLogSchema.index({ sequenceNumber: 1 });
immutableAuditLogSchema.index({ currentHash: 1 });
immutableAuditLogSchema.index({ workspaceId: 1, createdAt: -1 });
immutableAuditLogSchema.index({ userId: 1, createdAt: -1 });
immutableAuditLogSchema.index({ action: 1, createdAt: -1 });
immutableAuditLogSchema.index({ 'complianceFlags.standard': 1, 'complianceFlags.status': 1 });
immutableAuditLogSchema.index({ riskLevel: 1, createdAt: -1 });

// Pre-save middleware to calculate hash and sequence
immutableAuditLogSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Get the last sequence number
    const lastLog = await this.constructor.findOne().sort({ sequenceNumber: -1 });
    this.sequenceNumber = lastLog ? lastLog.sequenceNumber + 1 : 1;
    this.previousHash = lastLog ? lastLog.currentHash : '0000000000000000000000000000000000000000000000000000000000000000';
    
    // Calculate current hash
    const dataToHash = JSON.stringify({
      sequenceNumber: this.sequenceNumber,
      previousHash: this.previousHash,
      userId: this.userId,
      action: this.action,
      entityType: this.entityType,
      entityId: this.entityId,
      changes: this.changes,
      timestamp: new Date()
    });
    
    this.currentHash = crypto.createHash('sha256').update(dataToHash).digest('hex');
    
    // Create digital signature
    this.signature = crypto.createHmac('sha256', process.env.AUDIT_SIGNATURE_KEY || 'default-key')
      .update(this.currentHash)
      .digest('hex');
  }
  next();
});

module.exports = mongoose.model('ImmutableAuditLog', immutableAuditLogSchema);