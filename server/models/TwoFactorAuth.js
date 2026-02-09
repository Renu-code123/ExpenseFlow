const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Two-Factor Authentication Configuration Model
 * Issue #503: 2FA Management
 * Handles TOTP secrets, backup codes, recovery email, and 2FA method preferences
 */

const twoFactorAuthSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  enabled: {
    type: Boolean,
    default: false,
    index: true
  },
  method: {
    type: String,
    enum: ['totp', 'sms', 'email', 'backup-codes'],
    default: 'totp'
  },
  // TOTP-specific fields
  totpSecret: {
    type: String,
    select: false
  },
  totpQrCode: {
    type: String,
    select: false
  },
  totpVerifiedAt: Date,
  // SMS-specific fields
  phoneNumber: {
    type: String,
    select: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  phoneVerificationCode: {
    type: String,
    select: false
  },
  phoneVerificationExpires: Date,
  // Email-specific fields
  recoveryEmail: {
    type: String,
    select: false
  },
  recoveryEmailVerified: {
    type: Boolean,
    default: false
  },
  recoveryEmailVerificationCode: {
    type: String,
    select: false
  },
  recoveryEmailVerificationExpires: Date,
  // Backup codes for recovery
  backupCodes: [{
    code: {
      type: String,
      required: true,
      select: false
    },
    used: {
      type: Boolean,
      default: false
    },
    usedAt: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Temporary setup secret before verification
  setupSecret: {
    type: String,
    select: false
  },
  setupSecretExpires: Date,
  setupAttempts: {
    type: Number,
    default: 0
  },
  // Method setup history
  methodHistory: [{
    method: String,
    action: {
      type: String,
      enum: ['enabled', 'disabled', 'switched', 'updated']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String
  }],
  // Settings
  requireForSensitiveActions: {
    type: Boolean,
    default: true
  },
  allowBackupCodesOnly: {
    type: Boolean,
    default: false
  },
  rememberDeviceForDays: {
    type: Number,
    default: 30
  },
  // Enrollment info
  enrolledAt: Date,
  enrollmentCompletedAt: Date,
  enrollmentIp: String,
  lastUsedAt: Date,
  lastUsedIp: String,
  // Recovery settings
  recoveryPhoneNumber: {
    type: String,
    select: false
  },
  recoveryPhoneVerified: {
    type: Boolean,
    default: false
  },
  // One-time passwords (for backup method)
  oneTimePasswords: [{
    password: {
      type: String,
      select: false
    },
    expiresAt: Date,
    used: {
      type: Boolean,
      default: false
    },
    usedAt: Date
  }],
  // Failed verification attempts
  failedAttempts: {
    type: Number,
    default: 0
  },
  failedAttemptsReset: Date,
  lockedUntil: Date
}, {
  timestamps: true
});

// Index for faster lookups
twoFactorAuthSchema.index({ userId: 1, enabled: 1 });
twoFactorAuthSchema.index({ userId: 1, method: 1 });

// Generate new backup codes
twoFactorAuthSchema.methods.generateBackupCodes = function(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push({
      code: code,
      used: false
    });
  }
  this.backupCodes = codes;
  return codes.map(c => c.code);
};

// Mark backup code as used
twoFactorAuthSchema.methods.useBackupCode = function(code) {
  const found = this.backupCodes.find(bc => bc.code === code && !bc.used);
  if (found) {
    found.used = true;
    found.usedAt = new Date();
    return true;
  }
  return false;
};

// Get unused backup codes count
twoFactorAuthSchema.methods.getUnusedBackupCodesCount = function() {
  return this.backupCodes.filter(bc => !bc.used).length;
};

// Record method history
twoFactorAuthSchema.methods.recordMethodHistory = function(action, method, ipAddress, userAgent) {
  this.methodHistory.push({
    method: method,
    action: action,
    ipAddress: ipAddress,
    userAgent: userAgent
  });
};

// Lock account temporarily due to failed attempts
twoFactorAuthSchema.methods.lockTemporarily = function(minutes = 15) {
  this.lockedUntil = new Date(Date.now() + minutes * 60 * 1000);
};

// Check if account is locked
twoFactorAuthSchema.methods.isLocked = function() {
  return this.lockedUntil && this.lockedUntil > new Date();
};

// Reset failed attempts
twoFactorAuthSchema.methods.resetFailedAttempts = function() {
  this.failedAttempts = 0;
  this.failedAttemptsReset = new Date();
  this.lockedUntil = null;
};

// Increment failed attempts
twoFactorAuthSchema.methods.incrementFailedAttempts = function() {
  this.failedAttempts = (this.failedAttempts || 0) + 1;
  if (this.failedAttempts >= 5) {
    this.lockTemporarily(15);
  }
};

module.exports = mongoose.model('TwoFactorAuth', twoFactorAuthSchema);
