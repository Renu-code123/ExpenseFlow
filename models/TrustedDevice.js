const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Trusted Device Model
 * Issue #503: 2FA Management - Device Trust Management
 * Stores trusted devices for users to skip 2FA verification on known devices
 */

const trustedDeviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  fingerprint: {
    type: String,
    required: true
  },
  deviceName: {
    type: String,
    default: 'Unknown Device'
  },
  deviceType: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'unknown'],
    default: 'unknown'
  },
  os: {
    type: String,
    default: 'Unknown'
  },
  browser: {
    type: String,
    default: 'Unknown'
  },
  ipAddress: {
    type: String,
    required: true
  },
  location: {
    country: String,
    city: String,
    latitude: Number,
    longitude: Number
  },
  // Trust info
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    type: String,
    select: false
  },
  verificationCodeExpires: Date,
  verificationMethod: {
    type: String,
    enum: ['email', 'sms', 'manual'],
    default: 'email'
  },
  // Usage tracking
  firstUsedAt: {
    type: Date,
    default: Date.now
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  },
  loginCount: {
    type: Number,
    default: 0
  },
  // Trust settings
  trustDuration: {
    type: Number,
    default: 30 // days
  },
  trustExpiresAt: Date,
  shouldRequire2fa: {
    type: Boolean,
    default: false
  },
  // Security
  isCompromised: {
    type: Boolean,
    default: false
  },
  compromisedAt: Date,
  // Notification settings
  notifyOnLogin: {
    type: Boolean,
    default: true
  },
  // Custom label
  userLabel: String,
  // Status
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for performance
trustedDeviceSchema.index({ userId: 1, deviceId: 1 });
trustedDeviceSchema.index({ userId: 1, isVerified: 1 });
trustedDeviceSchema.index({ userId: 1, isActive: 1 });
trustedDeviceSchema.index({ trustExpiresAt: 1 });

// Update last used time
trustedDeviceSchema.methods.updateLastUsed = function(ipAddress) {
  this.lastUsedAt = new Date();
  this.loginCount = (this.loginCount || 0) + 1;
  if (ipAddress) {
    this.ipAddress = ipAddress;
  }
};

// Check if device trust is expired
trustedDeviceSchema.methods.isTrustExpired = function() {
  if (!this.isVerified) return true;
  if (this.isCompromised) return true;
  if (!this.isActive) return true;
  if (this.trustExpiresAt && this.trustExpiresAt < new Date()) return true;
  return false;
};

// Renew trust
trustedDeviceSchema.methods.renewTrust = function(daysToAdd = 30) {
  this.trustExpiresAt = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
  this.isCompromised = false;
  this.compromisedAt = null;
};

// Mark as compromised
trustedDeviceSchema.methods.markCompromised = function() {
  this.isCompromised = true;
  this.compromisedAt = new Date();
  this.isActive = false;
};

// Deactivate device
trustedDeviceSchema.methods.deactivate = function() {
  this.isActive = false;
};

// Activate device
trustedDeviceSchema.methods.activate = function() {
  this.isActive = true;
};

// Generate verification code
trustedDeviceSchema.methods.generateVerificationCode = function(expiryMinutes = 30) {
  this.verificationCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  this.verificationCodeExpires = new Date(Date.now() + expiryMinutes * 60 * 1000);
};

module.exports = mongoose.model('TrustedDevice', trustedDeviceSchema);
