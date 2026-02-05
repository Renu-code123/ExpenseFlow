const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Session Management Model
 * Tracks active logins and enables remote session revocation
 * Issue #338: Audit Trail & TOTP Security Suite
 */

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Unique session identifier
  sessionToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // JWT token ID (jti claim) for token invalidation
  jwtId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Session status
  status: {
    type: String,
    enum: ['active', 'revoked', 'expired', 'logged_out'],
    default: 'active',
    index: true
  },
  // Device and location info
  device: {
    type: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'unknown'
    },
    name: String,
    os: String,
    osVersion: String,
    browser: String,
    browserVersion: String,
    isMobile: {
      type: Boolean,
      default: false
    }
  },
  location: {
    ipAddress: {
      type: String,
      required: true
    },
    country: String,
    city: String,
    region: String,
    timezone: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  // Security flags
  security: {
    totpVerified: {
      type: Boolean,
      default: false
    },
    totpVerifiedAt: Date,
    trustLevel: {
      type: String,
      enum: ['untrusted', 'standard', 'trusted', 'elevated'],
      default: 'standard'
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    flags: [String]
  },
  // User agent string
  userAgent: String,
  // Activity tracking
  activity: {
    lastAccessAt: {
      type: Date,
      default: Date.now
    },
    lastAccessIp: String,
    accessCount: {
      type: Number,
      default: 1
    },
    lastEndpoint: String
  },
  // Session metadata
  metadata: {
    loginMethod: {
      type: String,
      enum: ['password', 'oauth', 'sso', 'api_key', 'magic_link'],
      default: 'password'
    },
    rememberMe: {
      type: Boolean,
      default: false
    },
    scope: [String]
  },
  // Revocation info
  revocation: {
    revokedAt: Date,
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      enum: ['manual', 'password_change', 'security_concern', 'admin_action', 'user_request', 'timeout', 'logout'],
      default: 'manual'
    },
    note: String
  },
  // Expiration
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { updatedAt: 'lastModifiedAt' }
});

// TTL index for automatic cleanup of expired sessions
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for common queries
sessionSchema.index({ userId: 1, status: 1, createdAt: -1 });
sessionSchema.index({ 'location.ipAddress': 1, status: 1 });

// Pre-save middleware to generate session token if not provided
sessionSchema.pre('save', function(next) {
  if (!this.sessionToken) {
    this.sessionToken = crypto.randomBytes(32).toString('hex');
  }
  next();
});

// Static method to create a new session
sessionSchema.statics.createSession = async function(userId, jwtId, req, options = {}) {
  const userAgent = req.headers?.['user-agent'] || 'Unknown';
  const ipAddress = req.ip || req.connection?.remoteAddress || 'Unknown';
  
  // Parse user agent for device info
  const deviceInfo = parseUserAgent(userAgent);
  
  // Calculate session expiration
  const expiresIn = options.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 30 days or 1 day
  const expiresAt = new Date(Date.now() + expiresIn);

  const session = new this({
    userId,
    sessionToken: crypto.randomBytes(32).toString('hex'),
    jwtId,
    device: deviceInfo,
    location: {
      ipAddress,
      ...options.geoLocation
    },
    userAgent,
    security: {
      totpVerified: options.totpVerified || false,
      totpVerifiedAt: options.totpVerified ? new Date() : null,
      trustLevel: options.trustLevel || 'standard'
    },
    activity: {
      lastAccessAt: new Date(),
      lastAccessIp: ipAddress,
      accessCount: 1
    },
    metadata: {
      loginMethod: options.loginMethod || 'password',
      rememberMe: options.rememberMe || false,
      scope: options.scope || ['*']
    },
    expiresAt
  });

  await session.save();
  return session;
};

// Static method to validate a session
sessionSchema.statics.validateSession = async function(jwtId) {
  const session = await this.findOne({
    jwtId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });

  if (!session) {
    return { valid: false, reason: 'Session not found or expired' };
  }

  // Update last access
  session.activity.lastAccessAt = new Date();
  session.activity.accessCount += 1;
  await session.save();

  return { valid: true, session };
};

// Static method to revoke a session
sessionSchema.statics.revokeSession = async function(sessionId, revokedBy, reason = 'manual', note = '') {
  const session = await this.findById(sessionId);
  
  if (!session) {
    throw new Error('Session not found');
  }

  session.status = 'revoked';
  session.revocation = {
    revokedAt: new Date(),
    revokedBy,
    reason,
    note
  };

  await session.save();
  return session;
};

// Static method to revoke all sessions for a user
sessionSchema.statics.revokeAllUserSessions = async function(userId, revokedBy, reason = 'user_request', excludeSessionId = null) {
  const query = {
    userId,
    status: 'active'
  };

  if (excludeSessionId) {
    query._id = { $ne: excludeSessionId };
  }

  const result = await this.updateMany(query, {
    $set: {
      status: 'revoked',
      revocation: {
        revokedAt: new Date(),
        revokedBy,
        reason
      }
    }
  });

  return result.modifiedCount;
};

// Static method to get active sessions for a user
sessionSchema.statics.getActiveSessions = async function(userId) {
  return this.find({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });
};

// Static method to get login history
sessionSchema.statics.getLoginHistory = async function(userId, limit = 20) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('-sessionToken -jwtId');
};

// Static method to check for suspicious sessions
sessionSchema.statics.detectSuspiciousSessions = async function(userId, currentIp) {
  const recentSessions = await this.find({
    userId,
    status: 'active',
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });

  const suspiciousIndicators = [];

  // Check for multiple IPs in short time
  const uniqueIps = [...new Set(recentSessions.map(s => s.location.ipAddress))];
  if (uniqueIps.length > 3) {
    suspiciousIndicators.push('multiple_ips');
  }

  // Check for new device
  const knownDevices = await this.distinct('device.name', {
    userId,
    createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
  });

  const currentSessions = recentSessions.filter(s => 
    !knownDevices.includes(s.device.name)
  );

  if (currentSessions.length > 0) {
    suspiciousIndicators.push('new_device');
  }

  return {
    suspicious: suspiciousIndicators.length > 0,
    indicators: suspiciousIndicators,
    activeSessions: recentSessions.length
  };
};

// Instance method to mark session as logged out
sessionSchema.methods.logout = async function() {
  this.status = 'logged_out';
  this.revocation = {
    revokedAt: new Date(),
    reason: 'logout'
  };
  return this.save();
};

// Instance method to verify TOTP was used
sessionSchema.methods.markTotpVerified = async function() {
  this.security.totpVerified = true;
  this.security.totpVerifiedAt = new Date();
  this.security.trustLevel = 'elevated';
  return this.save();
};

// Instance method to update activity
sessionSchema.methods.updateActivity = async function(req) {
  this.activity.lastAccessAt = new Date();
  this.activity.lastAccessIp = req.ip || req.connection?.remoteAddress;
  this.activity.accessCount += 1;
  this.activity.lastEndpoint = req.originalUrl;
  return this.save();
};

// Helper function to parse user agent
function parseUserAgent(ua) {
  const device = {
    type: 'unknown',
    name: 'Unknown Device',
    os: 'Unknown',
    osVersion: '',
    browser: 'Unknown',
    browserVersion: '',
    isMobile: false
  };

  if (!ua) return device;

  // Detect mobile
  device.isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  
  // Detect device type
  if (/iPad|Tablet/i.test(ua)) {
    device.type = 'tablet';
  } else if (device.isMobile) {
    device.type = 'mobile';
  } else {
    device.type = 'desktop';
  }

  // Detect OS
  if (/Windows NT 10/i.test(ua)) {
    device.os = 'Windows';
    device.osVersion = '10';
  } else if (/Windows NT 6.3/i.test(ua)) {
    device.os = 'Windows';
    device.osVersion = '8.1';
  } else if (/Windows/i.test(ua)) {
    device.os = 'Windows';
  } else if (/Mac OS X/i.test(ua)) {
    device.os = 'macOS';
    const match = ua.match(/Mac OS X (\d+[._]\d+)/);
    if (match) device.osVersion = match[1].replace('_', '.');
  } else if (/Android/i.test(ua)) {
    device.os = 'Android';
    const match = ua.match(/Android (\d+\.?\d*)/);
    if (match) device.osVersion = match[1];
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    device.os = 'iOS';
    const match = ua.match(/OS (\d+[._]\d+)/);
    if (match) device.osVersion = match[1].replace('_', '.');
  } else if (/Linux/i.test(ua)) {
    device.os = 'Linux';
  }

  // Detect browser
  if (/Edg\//i.test(ua)) {
    device.browser = 'Edge';
    const match = ua.match(/Edg\/(\d+)/);
    if (match) device.browserVersion = match[1];
  } else if (/Chrome/i.test(ua) && !/Chromium/i.test(ua)) {
    device.browser = 'Chrome';
    const match = ua.match(/Chrome\/(\d+)/);
    if (match) device.browserVersion = match[1];
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    device.browser = 'Safari';
    const match = ua.match(/Version\/(\d+)/);
    if (match) device.browserVersion = match[1];
  } else if (/Firefox/i.test(ua)) {
    device.browser = 'Firefox';
    const match = ua.match(/Firefox\/(\d+)/);
    if (match) device.browserVersion = match[1];
  }

  // Generate device name
  device.name = `${device.browser} on ${device.os}${device.osVersion ? ' ' + device.osVersion : ''}`;

  return device;
}

module.exports = mongoose.model('Session', sessionSchema);
