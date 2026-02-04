const mongoose = require('mongoose');

/**
 * BlockedEntity Schema
 * Manages blacklist of merchants, IPs, devices, and cards
 */
const blockedEntitySchema = new mongoose.Schema({
  type: {
    type: String,
    required: [true, 'Entity type is required'],
    enum: {
      values: ['merchant', 'ip', 'device', 'card', 'email', 'phone', 'country', 'user'],
      message: '{VALUE} is not a valid entity type'
    },
    index: true
  },
  value: {
    type: String,
    required: [true, 'Entity value is required'],
    index: true,
    trim: true
  },
  // Hashed version for sensitive data (card numbers, emails)
  hashedValue: {
    type: String,
    index: true
  },
  reason: {
    type: String,
    required: [true, 'Block reason is required'],
    enum: {
      values: [
        'confirmed_fraud',
        'repeated_chargebacks',
        'suspicious_activity',
        'identity_theft',
        'account_takeover',
        'multiple_violations',
        'high_risk_region',
        'known_fraudster',
        'compliance_violation',
        'user_request',
        'manual_review',
        'automated_detection',
        'third_party_report',
        'payment_abuse',
        'terms_violation'
      ],
      message: '{VALUE} is not a valid block reason'
    }
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  // Block details
  details: {
    description: String,
    associatedTransactions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense'
    }],
    associatedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    associatedEvents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnomalyEvent'
    }],
    evidence: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  // Block scope
  scope: {
    type: String,
    enum: ['global', 'platform', 'user_specific'],
    default: 'platform',
    required: true
  },
  // For user-specific blocks
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  // Expiration
  expiresAt: {
    type: Date,
    index: true
  },
  isPermanent: {
    type: Boolean,
    default: false,
    index: true
  },
  // Status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  // Management
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Added by is required']
  },
  addedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Removal tracking
  removedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  removedAt: {
    type: Date
  },
  removalReason: {
    type: String
  },
  // Block effectiveness
  hits: {
    total: {
      type: Number,
      default: 0
    },
    last30Days: {
      type: Number,
      default: 0
    },
    lastHitAt: Date
  },
  preventedTransactions: {
    type: Number,
    default: 0
  },
  preventedLoss: {
    type: Number,
    default: 0
  },
  // Review and appeals
  reviewRequired: {
    type: Boolean,
    default: false,
    index: true
  },
  lastReviewedAt: Date,
  lastReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  appealCount: {
    type: Number,
    default: 0
  },
  appeals: [{
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    submittedAt: {
      type: Date,
      default: Date.now
    },
    reason: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date,
    reviewNotes: String
  }],
  // Source information
  source: {
    type: {
      type: String,
      enum: ['internal', 'external_api', 'user_report', 'automated_system', 'manual_entry'],
      default: 'manual_entry'
    },
    provider: String,
    externalId: String,
    confidence: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  // Related blocks
  relatedBlocks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlockedEntity'
  }],
  // Additional attributes for specific types
  attributes: {
    // For merchant blocks
    merchantCategory: String,
    merchantCountry: String,
    
    // For IP blocks
    ipRange: String,
    asn: String,
    isp: String,
    
    // For device blocks
    deviceType: String,
    deviceModel: String,
    osVersion: String,
    
    // For card blocks
    cardType: String,
    cardBrand: String,
    lastFourDigits: String,
    
    // For country blocks
    countryCode: String,
    region: String
  },
  // Notification settings
  notifications: {
    alertOnHit: {
      type: Boolean,
      default: false
    },
    notifyUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  // Tags for organization
  tags: [{
    type: String,
    trim: true
  }],
  // Notes and comments
  notes: [{
    text: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes
blockedEntitySchema.index({ type: 1, value: 1 });
blockedEntitySchema.index({ type: 1, isActive: 1 });
blockedEntitySchema.index({ scope: 1, isActive: 1 });
blockedEntitySchema.index({ expiresAt: 1, isActive: 1 });
blockedEntitySchema.index({ hashedValue: 1 });
blockedEntitySchema.index({ userId: 1, type: 1, isActive: 1 });
blockedEntitySchema.index({ addedAt: -1 });
blockedEntitySchema.index({ 'hits.lastHitAt': -1 });

// Compound indexes
blockedEntitySchema.index({ type: 1, value: 1, userId: 1, isActive: 1 });
blockedEntitySchema.index({ severity: 1, isActive: 1 });

// Virtual for is expired
blockedEntitySchema.virtual('isExpired').get(function() {
  if (this.isPermanent) return false;
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// Virtual for days until expiration
blockedEntitySchema.virtual('daysUntilExpiration').get(function() {
  if (this.isPermanent) return Infinity;
  if (!this.expiresAt) return null;
  
  const now = new Date();
  const diff = this.expiresAt - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Virtual for effectiveness rate
blockedEntitySchema.virtual('effectivenessRate').get(function() {
  if (this.hits.total === 0) return 0;
  return (this.preventedTransactions / this.hits.total) * 100;
});

// Methods

/**
 * Record a hit on this blocked entity
 */
blockedEntitySchema.methods.recordHit = async function(preventedAmount = 0) {
  this.hits.total += 1;
  this.hits.last30Days += 1;
  this.hits.lastHitAt = new Date();
  
  if (preventedAmount > 0) {
    this.preventedTransactions += 1;
    this.preventedLoss += preventedAmount;
  }
  
  // Send notification if configured
  if (this.notifications.alertOnHit && this.notifications.notifyUsers.length > 0) {
    // Notification logic would be implemented in service layer
  }
  
  return await this.save();
};

/**
 * Extend expiration date
 */
blockedEntitySchema.methods.extendExpiration = async function(days, userId) {
  if (this.isPermanent) {
    throw new Error('Cannot extend permanent blocks');
  }
  
  const currentExpiry = this.expiresAt || new Date();
  this.expiresAt = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);
  this.updatedBy = userId;
  
  return await this.save();
};

/**
 * Make block permanent
 */
blockedEntitySchema.methods.makePermanent = async function(userId, reason) {
  this.isPermanent = true;
  this.expiresAt = null;
  this.updatedBy = userId;
  
  this.notes.push({
    text: `Made permanent: ${reason}`,
    addedBy: userId,
    addedAt: new Date()
  });
  
  return await this.save();
};

/**
 * Deactivate block
 */
blockedEntitySchema.methods.deactivate = async function(userId, reason) {
  this.isActive = false;
  this.removedBy = userId;
  this.removedAt = new Date();
  this.removalReason = reason;
  
  return await this.save();
};

/**
 * Reactivate block
 */
blockedEntitySchema.methods.reactivate = async function(userId) {
  this.isActive = true;
  this.removedBy = null;
  this.removedAt = null;
  this.removalReason = null;
  this.updatedBy = userId;
  
  return await this.save();
};

/**
 * Submit appeal
 */
blockedEntitySchema.methods.submitAppeal = async function(userId, reason) {
  this.appeals.push({
    submittedBy: userId,
    reason,
    status: 'pending'
  });
  
  this.appealCount += 1;
  
  return await this.save();
};

/**
 * Review appeal
 */
blockedEntitySchema.methods.reviewAppeal = async function(appealId, status, reviewerId, notes) {
  const appeal = this.appeals.id(appealId);
  
  if (!appeal) {
    throw new Error('Appeal not found');
  }
  
  appeal.status = status;
  appeal.reviewedBy = reviewerId;
  appeal.reviewedAt = new Date();
  appeal.reviewNotes = notes;
  
  // If approved, deactivate the block
  if (status === 'approved') {
    await this.deactivate(reviewerId, `Appeal approved: ${notes}`);
  }
  
  return await this.save();
};

/**
 * Add note
 */
blockedEntitySchema.methods.addNote = async function(text, userId) {
  this.notes.push({
    text,
    addedBy: userId,
    addedAt: new Date()
  });
  
  return await this.save();
};

/**
 * Link related block
 */
blockedEntitySchema.methods.linkRelatedBlock = async function(blockId) {
  if (!this.relatedBlocks.includes(blockId)) {
    this.relatedBlocks.push(blockId);
    return await this.save();
  }
  return this;
};

/**
 * Mark for review
 */
blockedEntitySchema.methods.markForReview = async function() {
  this.reviewRequired = true;
  return await this.save();
};

/**
 * Complete review
 */
blockedEntitySchema.methods.completeReview = async function(reviewerId) {
  this.reviewRequired = false;
  this.lastReviewedAt = new Date();
  this.lastReviewedBy = reviewerId;
  return await this.save();
};

/**
 * Check if entity matches
 */
blockedEntitySchema.methods.matches = function(value, userId = null) {
  if (!this.isActive) return false;
  if (this.isExpired) return false;
  
  // Check scope
  if (this.scope === 'user_specific' && (!userId || !this.userId.equals(userId))) {
    return false;
  }
  
  // Check value match
  if (this.value === value) return true;
  
  // Check hashed value if applicable
  if (this.hashedValue && this.hashValue(value) === this.hashedValue) {
    return true;
  }
  
  // Check IP range for IP type
  if (this.type === 'ip' && this.attributes?.ipRange) {
    return this.isIPInRange(value, this.attributes.ipRange);
  }
  
  return false;
};

/**
 * Hash sensitive value
 */
blockedEntitySchema.methods.hashValue = function(value) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(value).digest('hex');
};

/**
 * Check if IP is in range
 */
blockedEntitySchema.methods.isIPInRange = function(ip, range) {
  // Simplified IP range check - would need proper CIDR implementation
  return range.split('/')[0] === ip.split('.').slice(0, 3).join('.');
};

// Static methods

/**
 * Check if entity is blocked
 */
blockedEntitySchema.statics.isBlocked = async function(type, value, userId = null) {
  const query = {
    type,
    isActive: true,
    $or: [
      { value },
      { hashedValue: this.prototype.hashValue(value) }
    ]
  };
  
  // Check expiration
  query.$or.push(
    { isPermanent: true },
    { expiresAt: { $gt: new Date() } }
  );
  
  // Check scope
  if (userId) {
    query.$or = [
      { scope: 'global' },
      { scope: 'platform' },
      { scope: 'user_specific', userId }
    ];
  } else {
    query.scope = { $in: ['global', 'platform'] };
  }
  
  const block = await this.findOne(query);
  
  if (block) {
    await block.recordHit();
    return { blocked: true, block };
  }
  
  return { blocked: false, block: null };
};

/**
 * Get active blocks
 */
blockedEntitySchema.statics.getActiveBlocks = async function(type = null, scope = null) {
  const query = {
    isActive: true,
    $or: [
      { isPermanent: true },
      { expiresAt: { $gt: new Date() } }
    ]
  };
  
  if (type) query.type = type;
  if (scope) query.scope = scope;
  
  return await this.find(query)
    .sort({ addedAt: -1 })
    .populate('addedBy', 'name email')
    .lean();
};

/**
 * Get blocks by user
 */
blockedEntitySchema.statics.getBlocksByUser = async function(userId) {
  return await this.find({
    $or: [
      { userId },
      { 'details.associatedUsers': userId }
    ]
  })
    .sort({ addedAt: -1 })
    .lean();
};

/**
 * Get expiring blocks
 */
blockedEntitySchema.statics.getExpiringBlocks = async function(daysAhead = 7) {
  const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  
  return await this.find({
    isActive: true,
    isPermanent: false,
    expiresAt: {
      $gt: new Date(),
      $lte: futureDate
    }
  })
    .sort({ expiresAt: 1 })
    .populate('addedBy', 'name email')
    .lean();
};

/**
 * Clean up expired blocks
 */
blockedEntitySchema.statics.cleanupExpired = async function() {
  const result = await this.updateMany(
    {
      isActive: true,
      isPermanent: false,
      expiresAt: { $lte: new Date() }
    },
    {
      $set: {
        isActive: false,
        removedAt: new Date(),
        removalReason: 'Automatically expired'
      }
    }
  );
  
  return result.modifiedCount;
};

/**
 * Get blocks requiring review
 */
blockedEntitySchema.statics.getBlocksRequiringReview = async function() {
  return await this.find({ reviewRequired: true })
    .sort({ addedAt: 1 })
    .populate('addedBy', 'name email')
    .lean();
};

/**
 * Get statistics
 */
blockedEntitySchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$type',
        total: { $sum: 1 },
        active: {
          $sum: { $cond: ['$isActive', 1, 0] }
        },
        permanent: {
          $sum: { $cond: ['$isPermanent', 1, 0] }
        },
        totalHits: { $sum: '$hits.total' },
        preventedLoss: { $sum: '$preventedLoss' }
      }
    },
    { $sort: { total: -1 } }
  ]);
  
  return stats;
};

/**
 * Get most effective blocks
 */
blockedEntitySchema.statics.getMostEffectiveBlocks = async function(limit = 10) {
  return await this.find({
    isActive: true,
    'hits.total': { $gte: 1 }
  })
    .sort({ preventedLoss: -1, 'hits.total': -1 })
    .limit(limit)
    .populate('addedBy', 'name email')
    .lean();
};

/**
 * Reset 30-day hit counters
 */
blockedEntitySchema.statics.reset30DayCounters = async function() {
  return await this.updateMany(
    {},
    { $set: { 'hits.last30Days': 0 } }
  );
};

const BlockedEntity = mongoose.model('BlockedEntity', blockedEntitySchema);

module.exports = BlockedEntity;
