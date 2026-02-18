const mongoose = require('mongoose');

/**
 * Security Event Model
 * Issue #504: Security Requirements
 * Issue #562: Session Anomaly Detection
 * 
 * Tracks security events including:
 * - 2FA verification attempts and failures
 * - Backup code usage and exhaustion
 * - Device fingerprint mismatches
 * - Geographic anomalies
 * - Velocity-based anomalies
 * - Session validation events
 * - Suspicious login detection
 * - Session anomaly detection (IP/UA drift, impossible travel)
 */

const securityEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  eventType: {
    type: String,
    enum: [
      'LOGIN_ATTEMPT',
      '2FA_ATTEMPT',
      '2FA_SUCCESS',
      '2FA_FAILURE',
      'BACKUP_CODE_ATTEMPT',
      'BACKUP_CODE_SUCCESS',
      'BACKUP_CODE_FAILURE',
      'BACKUP_CODE_EXHAUSTED',
      'DEVICE_FINGERPRINT_MISMATCH',
      'DEVICE_FINGERPRINT_MATCH',
      'GEOGRAPHIC_ANOMALY',
      'VELOCITY_ANOMALY',
      'SESSION_VALIDATION_FAILED',
      'SESSION_VALIDATION_SUCCESS',
      'SUSPICIOUS_LOGIN',
      'LOGIN_FROM_NEW_LOCATION',
      'LOGIN_FROM_NEW_DEVICE',
      'SUSPICIOUS_TRANSACTION',
      'DEVICE_CHANGE',
      'LOCATION_ANOMALY',
      'BRUTE_FORCE_ATTEMPT',
      'IP_BLOCKED',
      'SESSION_ANOMALY_DETECTED',
      'FORCED_REAUTH',
      'IP_DRIFT_DETECTED',
      'USER_AGENT_DRIFT_DETECTED',
      'IMPOSSIBLE_TRAVEL_DETECTED',
      'RAPID_SESSION_SWITCHING_DETECTED'
    ],
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: ['info', 'low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  source: String,
  ipAddress: {
    type: String,
    required: true,
    index: true
  },
  userAgent: String,
  deviceFingerprint: String,
  location: {
    country: String,
    city: String,
    latitude: Number,
    longitude: Number,
    timezone: String
  },
  previousLocation: {
    country: String,
    city: String,
    latitude: Number,
    longitude: Number,
    timezone: String,
    timestamp: Date
  },
  details: {
    method: String, // totp, backup-code, email, sms
    reason: String, // anomaly reason, backup code exhausted, etc.
    backupCodesRemaining: Number,
    distanceFromLastLogin: Number, // kilometers
    timeSinceLastLogin: Number, // milliseconds
    failureReason: String,
    attemptNumber: Number
  },
  riskScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  threatIntelligence: {
    isKnownThreat: Boolean,
    threatType: String,
    blacklistMatch: Boolean,
    reputation: Number
  },
  correlatedEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SecurityEvent' }],
  flagged: {
    type: Boolean,
    default: false,
    index: true
  },
  flaggedReason: String,
  requiresManualReview: {
    type: Boolean,
    default: false
  },
  investigation: {
    status: { type: String, enum: ['open', 'investigating', 'resolved', 'false_positive'], default: 'open' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: [{ message: String, createdAt: { type: Date, default: Date.now } }]
  },
  action: {
    type: String,
    enum: ['allowed', 'blocked', 'challenged', 'under_review'],
    default: 'allowed'
  },
  automated: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for querying
securityEventSchema.index({ userId: 1, createdAt: -1 });
securityEventSchema.index({ eventType: 1, createdAt: -1 });
securityEventSchema.index({ flagged: 1, createdAt: -1 });
securityEventSchema.index({ 'investigation.status': 1 });

// Static method: Log security event
securityEventSchema.statics.logEvent = async function(eventData) {
  try {
    const event = new this({
      userId: eventData.userId || eventData.user,
      eventType: eventData.eventType,
      severity: eventData.severity || 'medium',
      source: eventData.source,
      ipAddress: eventData.ipAddress,
      userAgent: eventData.userAgent,
      deviceFingerprint: eventData.deviceFingerprint,
      location: eventData.location,
      previousLocation: eventData.previousLocation,
      details: eventData.details,
      riskScore: eventData.riskScore || 0,
      threatIntelligence: eventData.threatIntelligence,
      flagged: (eventData.riskScore || 0) >= 70,
      flaggedReason: eventData.riskScore >= 70 ? 'High risk score' : null,
      requiresManualReview: (eventData.riskScore || 0) >= 85,
      action: eventData.action || 'allowed',
      automated: true
    });

    await event.save();
    return event;
  } catch (error) {
    console.error('Error logging security event:', error);
    throw error;
  }
};

// Static method: Get recent events for user
securityEventSchema.statics.getRecentEvents = async function(userId, hours = 24, limit = 50) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    userId,
    createdAt: { $gte: cutoffTime }
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();
};

// Static method: Get flagged events
securityEventSchema.statics.getFlaggedEvents = async function(limit = 100) {
  return this.find({
    flagged: true,
    $or: [
      { requiresManualReview: true },
      { 'investigation.status': { $in: ['open', 'investigating'] } }
    ]
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'email name')
    .lean()
    .exec();
};

// Static method: Count failed 2FA attempts in timeframe
securityEventSchema.statics.count2FAFailures = async function(userId, minutes = 10) {
  const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
  return this.countDocuments({
    userId,
    eventType: { $in: ['2FA_FAILURE', 'BACKUP_CODE_FAILURE'] },
    createdAt: { $gte: cutoffTime }
  });
};

// Static method: Check for velocity anomalies (multiple logins/2FA attempts in short time)
securityEventSchema.statics.checkVelocityAnomaly = async function(userId, minutes = 30) {
  const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
  const count = await this.countDocuments({
    userId,
    eventType: { $in: ['2FA_SUCCESS', 'SESSION_VALIDATION_SUCCESS', 'LOGIN_ATTEMPT'] },
    createdAt: { $gte: cutoffTime }
  });
  // Anomaly if more than 5 successful attempts in timeframe
  return count > 5;
};

// Static method: Check for geographic anomalies
securityEventSchema.statics.checkGeographicAnomaly = async function(userId) {
  const recentEvent = await this.findOne({
    userId,
    'location.country': { $exists: true }
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  if (!recentEvent || !recentEvent.previousLocation) {
    return { isAnomaly: false };
  }

  const location = recentEvent.location;
  const previousLocation = recentEvent.previousLocation;

  if (location.country !== previousLocation.country) {
    const distance = calculateDistance(
      previousLocation.latitude,
      previousLocation.longitude,
      location.latitude,
      location.longitude
    );

    const timeDiff = (recentEvent.createdAt - previousLocation.timestamp) / 1000 / 60;
    const speedRequired = distance / (timeDiff / 60);

    // If speed > 900 km/h (faster than commercial plane), flag as anomaly
    if (speedRequired > 900) {
      return {
        isAnomaly: true,
        distance,
        speedRequired,
        timeDiff,
        from: previousLocation,
        to: location
      };
    }
  }

  return { isAnomaly: false };
};

// Helper function to calculate distance between coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = mongoose.model('SecurityEvent', securityEventSchema);