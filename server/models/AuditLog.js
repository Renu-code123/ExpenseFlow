const mongoose = require('mongoose');

/**
 * Enterprise-Grade Audit Trail Model
 * Tracks all write operations and security events
 * Issue #338: Audit Trail & TOTP Security Suite
 */

const auditLogSchema = new mongoose.Schema({
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
      // Expense operations
      'expense_created', 'expense_updated', 'expense_deleted', 'expense_approved', 'expense_rejected',
      // Budget operations
      'budget_created', 'budget_updated', 'budget_deleted',
      // Member operations
      'member_added', 'member_removed', 'member_role_changed',
      // Workspace operations
      'workspace_created', 'workspace_updated', 'workspace_deleted',
      // Approval operations
      'approval_submitted', 'approval_processed', 'approval_delegated',
      // Report operations
      'report_generated', 'data_exported', 'settings_changed',
      // Authentication & Security operations (Issue #338)
      'user_login', 'user_logout', 'user_register',
      'login_failed', 'login_blocked', 'password_changed', 'password_reset_requested', 'password_reset_completed',
      // 2FA operations
      'totp_enabled', 'totp_disabled', 'totp_verified', 'totp_failed', 'totp_backup_used',
      'backup_codes_generated', 'backup_codes_regenerated',
      // Session operations
      'session_created', 'session_revoked', 'session_expired', 'all_sessions_revoked',
      // Security events
      'suspicious_activity', 'ip_blocked', 'rate_limit_exceeded',
      'account_locked', 'account_unlocked',
      // Data operations
      'profile_updated', 'email_changed', 'api_key_created', 'api_key_revoked'
    ]
  },
  entityType: {
    type: String,
    required: true,
    enum: ['expense', 'budget', 'workspace', 'user', 'approval', 'report', 'session', 'security', 'authentication']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false // Not required for security events
  },
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    fields: [String] // List of modified fields
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    sessionId: String,
    apiEndpoint: String,
    requestId: String,
    // Enhanced security metadata
    geoLocation: {
      country: String,
      city: String,
      region: String,
      timezone: String
    },
    device: {
      type: String,
      os: String,
      browser: String,
      isMobile: Boolean
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['success', 'failure', 'pending', 'blocked'],
    default: 'success'
  },
  tags: [String],
  // Additional context for security events
  securityContext: {
    totpUsed: Boolean,
    newDevice: Boolean,
    newLocation: Boolean,
    failedAttempts: Number,
    riskFactors: [String]
  },
  // For compliance and retention
  retentionPolicy: {
    type: String,
    enum: ['standard', 'extended', 'permanent'],
    default: 'standard'
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Default 2 years retention for standard logs
      return new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
auditLogSchema.index({ workspaceId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });
auditLogSchema.index({ status: 1, createdAt: -1 });
auditLogSchema.index({ 'metadata.ipAddress': 1, createdAt: -1 });
auditLogSchema.index({ 'metadata.sessionId': 1 });
auditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Static methods for common audit operations
auditLogSchema.statics.logSecurityEvent = async function(userId, action, metadata = {}, options = {}) {
  return this.create({
    userId,
    action,
    entityType: 'security',
    entityId: userId,
    metadata,
    severity: options.severity || 'medium',
    status: options.status || 'success',
    securityContext: options.securityContext || {},
    tags: options.tags || ['security']
  });
};

auditLogSchema.statics.logAuthEvent = async function(userId, action, req, options = {}) {
  const metadata = {
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers?.['user-agent'],
    apiEndpoint: req.originalUrl,
    sessionId: req.sessionId
  };

  return this.create({
    userId,
    action,
    entityType: 'authentication',
    entityId: userId,
    metadata,
    severity: options.severity || 'medium',
    status: options.status || 'success',
    securityContext: options.securityContext || {},
    tags: ['authentication', ...(options.tags || [])]
  });
};

auditLogSchema.statics.logWriteOperation = async function(userId, action, entityType, entityId, changes, req, options = {}) {
  const metadata = {
    ipAddress: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.headers?.['user-agent'],
    apiEndpoint: req?.originalUrl,
    sessionId: req?.sessionId
  };

  return this.create({
    userId,
    action,
    entityType,
    entityId,
    changes,
    metadata,
    severity: options.severity || 'low',
    status: options.status || 'success',
    tags: options.tags || []
  });
};

// Instance method to get human-readable description
auditLogSchema.methods.getDescription = function() {
  const actionDescriptions = {
    'user_login': 'User logged in',
    'user_logout': 'User logged out',
    'login_failed': 'Failed login attempt',
    'totp_enabled': 'Two-factor authentication enabled',
    'totp_disabled': 'Two-factor authentication disabled',
    'totp_verified': 'Two-factor authentication verified',
    'totp_failed': 'Two-factor authentication failed',
    'session_revoked': 'Session was revoked',
    'all_sessions_revoked': 'All sessions were revoked',
    'password_changed': 'Password was changed',
    'suspicious_activity': 'Suspicious activity detected'
  };

  return actionDescriptions[this.action] || this.action.replace(/_/g, ' ');
};

// Query helper for security timeline
auditLogSchema.query.securityTimeline = function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.find({
    userId,
    entityType: { $in: ['security', 'authentication'] },
    createdAt: { $gte: startDate }
  }).sort({ createdAt: -1 });
};

// Query helper for login history
auditLogSchema.query.loginHistory = function(userId, limit = 50) {
  return this.find({
    userId,
    action: { $in: ['user_login', 'login_failed', 'totp_verified', 'totp_failed'] }
  }).sort({ createdAt: -1 }).limit(limit);
};

module.exports = mongoose.model('AuditLog', auditLogSchema);