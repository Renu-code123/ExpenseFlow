const mongoose = require('mongoose');

/**
 * AnomalyEvent Schema
 * Records detected anomalies and fraud attempts
 */
const anomalyEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense',
    required: [true, 'Transaction ID is required'],
    index: true
  },
  ruleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AnomalyRule',
    required: [true, 'Rule ID is required'],
    index: true
  },
  type: {
    type: String,
    required: [true, 'Anomaly type is required'],
    enum: {
      values: [
        'unusual_amount',
        'suspicious_velocity',
        'abnormal_pattern',
        'geo_anomaly',
        'behavioral_deviation',
        'duplicate_transaction',
        'merchant_anomaly',
        'time_anomaly',
        'category_anomaly',
        'device_mismatch',
        'multiple_failures',
        'compromised_credentials'
      ],
      message: '{VALUE} is not a valid anomaly type'
    }
  },
  score: {
    type: Number,
    required: [true, 'Anomaly score is required'],
    min: [0, 'Score must be between 0 and 100'],
    max: [100, 'Score must be between 0 and 100'],
    index: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true
  },
  details: {
    // Flexible object for anomaly-specific information
    description: String,
    triggeredConditions: [String],
    expectedValue: mongoose.Schema.Types.Mixed,
    actualValue: mongoose.Schema.Types.Mixed,
    deviationPercentage: Number,
    contributingFactors: [{
      factor: String,
      weight: Number,
      value: mongoose.Schema.Types.Mixed
    }],
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: {
      values: ['pending', 'confirmed_fraud', 'false_positive', 'resolved', 'escalated'],
      message: '{VALUE} is not a valid status'
    },
    default: 'pending',
    index: true
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  reviewNotes: {
    type: String,
    maxlength: [1000, 'Review notes cannot exceed 1000 characters']
  },
  // Actions taken
  actionsTaken: [{
    action: {
      type: String,
      enum: ['alert_sent', 'transaction_blocked', 'account_locked', 'review_requested', 'user_notified', 'escalated', 'auto_resolved']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    details: String
  }],
  // Evidence and context
  context: {
    transactionAmount: Number,
    transactionCategory: String,
    merchant: String,
    location: {
      country: String,
      city: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    device: {
      type: String,
      fingerprint: String,
      ipAddress: String
    },
    timestamp: Date,
    userBehaviorScore: Number,
    recentTransactions: Number,
    accountAge: Number
  },
  // Investigation
  investigation: {
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    startedAt: Date,
    completedAt: Date,
    findings: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    }
  },
  // User response
  userResponse: {
    acknowledged: {
      type: Boolean,
      default: false
    },
    acknowledgedAt: Date,
    disputeRaised: {
      type: Boolean,
      default: false
    },
    disputeDetails: String,
    userConfirmedFraud: Boolean,
    responseTimestamp: Date
  },
  // Related events
  relatedEvents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AnomalyEvent'
  }],
  // Financial impact
  financialImpact: {
    potentialLoss: Number,
    actualLoss: Number,
    recovered: Number,
    preventedLoss: Number
  },
  // Auto-resolution
  autoResolved: {
    type: Boolean,
    default: false
  },
  autoResolvedAt: {
    type: Date
  },
  autoResolveReason: {
    type: String
  },
  // Notifications sent
  notificationsSent: [{
    channel: {
      type: String,
      enum: ['email', 'sms', 'push', 'webhook']
    },
    sentAt: Date,
    status: {
      type: String,
      enum: ['sent', 'delivered', 'failed', 'bounced']
    }
  }],
  // ML confidence
  mlConfidence: {
    type: Number,
    min: 0,
    max: 100
  },
  // False positive feedback
  feedbackProvided: {
    type: Boolean,
    default: false
  },
  feedbackScore: {
    type: Number,
    min: 1,
    max: 5
  }
}, {
  timestamps: true
});

// Indexes
anomalyEventSchema.index({ userId: 1, createdAt: -1 });
anomalyEventSchema.index({ status: 1, createdAt: -1 });
anomalyEventSchema.index({ score: -1, status: 1 });
anomalyEventSchema.index({ type: 1, status: 1 });
anomalyEventSchema.index({ severity: 1, status: 1 });
anomalyEventSchema.index({ 'investigation.assignedTo': 1, status: 1 });
anomalyEventSchema.index({ createdAt: -1 });

// Compound indexes
anomalyEventSchema.index({ userId: 1, status: 1, createdAt: -1 });
anomalyEventSchema.index({ ruleId: 1, status: 1 });
anomalyEventSchema.index({ transactionId: 1 });

// Virtual for risk level
anomalyEventSchema.virtual('riskLevel').get(function() {
  if (this.score >= 80) return 'critical';
  if (this.score >= 60) return 'high';
  if (this.score >= 40) return 'medium';
  return 'low';
});

// Virtual for is pending
anomalyEventSchema.virtual('isPending').get(function() {
  return this.status === 'pending';
});

// Virtual for is resolved
anomalyEventSchema.virtual('isResolved').get(function() {
  return ['confirmed_fraud', 'false_positive', 'resolved'].includes(this.status);
});

// Virtual for resolution time (in hours)
anomalyEventSchema.virtual('resolutionTime').get(function() {
  if (!this.reviewedAt) return null;
  const diff = this.reviewedAt - this.createdAt;
  return diff / (1000 * 60 * 60); // Convert to hours
});

// Methods

/**
 * Mark as confirmed fraud
 */
anomalyEventSchema.methods.confirmFraud = async function(reviewerId, notes) {
  this.status = 'confirmed_fraud';
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  this.reviewNotes = notes;
  
  // Record action
  this.actionsTaken.push({
    action: 'review_requested',
    performedBy: reviewerId,
    details: 'Confirmed as fraud'
  });
  
  // Update rule effectiveness
  const AnomalyRule = mongoose.model('AnomalyRule');
  const rule = await AnomalyRule.findById(this.ruleId);
  if (rule) {
    await rule.recordDetection(true);
  }
  
  return await this.save();
};

/**
 * Mark as false positive
 */
anomalyEventSchema.methods.markFalsePositive = async function(reviewerId, notes) {
  this.status = 'false_positive';
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  this.reviewNotes = notes;
  
  // Record action
  this.actionsTaken.push({
    action: 'auto_resolved',
    performedBy: reviewerId,
    details: 'Marked as false positive'
  });
  
  // Update rule effectiveness
  const AnomalyRule = mongoose.model('AnomalyRule');
  const rule = await AnomalyRule.findById(this.ruleId);
  if (rule) {
    await rule.recordDetection(false);
  }
  
  return await this.save();
};

/**
 * Escalate event
 */
anomalyEventSchema.methods.escalate = async function(assignTo, reason) {
  this.status = 'escalated';
  
  if (!this.investigation) {
    this.investigation = {};
  }
  
  this.investigation.assignedTo = assignTo;
  this.investigation.startedAt = new Date();
  this.investigation.priority = 'urgent';
  
  this.actionsTaken.push({
    action: 'escalated',
    performedBy: assignTo,
    details: reason
  });
  
  return await this.save();
};

/**
 * Record action taken
 */
anomalyEventSchema.methods.recordAction = async function(action, performedBy, details = null) {
  this.actionsTaken.push({
    action,
    performedBy,
    details,
    timestamp: new Date()
  });
  
  return await this.save();
};

/**
 * Auto-resolve based on criteria
 */
anomalyEventSchema.methods.autoResolve = async function(reason) {
  this.status = 'resolved';
  this.autoResolved = true;
  this.autoResolvedAt = new Date();
  this.autoResolveReason = reason;
  
  this.actionsTaken.push({
    action: 'auto_resolved',
    details: reason,
    timestamp: new Date()
  });
  
  return await this.save();
};

/**
 * Send notification
 */
anomalyEventSchema.methods.sendNotification = async function(channel) {
  this.notificationsSent.push({
    channel,
    sentAt: new Date(),
    status: 'sent'
  });
  
  return await this.save();
};

/**
 * Update notification status
 */
anomalyEventSchema.methods.updateNotificationStatus = async function(channel, status) {
  const notification = this.notificationsSent.find(n => 
    n.channel === channel && n.status === 'sent'
  );
  
  if (notification) {
    notification.status = status;
    return await this.save();
  }
  
  return this;
};

/**
 * Link related event
 */
anomalyEventSchema.methods.linkRelatedEvent = async function(eventId) {
  if (!this.relatedEvents.includes(eventId)) {
    this.relatedEvents.push(eventId);
    return await this.save();
  }
  return this;
};

/**
 * Calculate and update financial impact
 */
anomalyEventSchema.methods.updateFinancialImpact = async function(impact) {
  this.financialImpact = {
    ...this.financialImpact,
    ...impact
  };
  
  return await this.save();
};

/**
 * Get age in hours
 */
anomalyEventSchema.methods.getAgeInHours = function() {
  const now = new Date();
  const diff = now - this.createdAt;
  return diff / (1000 * 60 * 60);
};

/**
 * Check if stale (unresolved for too long)
 */
anomalyEventSchema.methods.isStale = function(thresholdHours = 48) {
  if (this.isResolved) return false;
  return this.getAgeInHours() > thresholdHours;
};

// Static methods

/**
 * Get events by user
 */
anomalyEventSchema.statics.getUserEvents = async function(userId, status = null) {
  const query = { userId };
  if (status) query.status = status;
  
  return await this.find(query)
    .sort({ createdAt: -1 })
    .populate('ruleId', 'name type severity')
    .populate('transactionId', 'amount category merchant')
    .lean();
};

/**
 * Get pending events
 */
anomalyEventSchema.statics.getPendingEvents = async function(limit = 50) {
  return await this.find({ status: 'pending' })
    .sort({ score: -1, createdAt: 1 })
    .limit(limit)
    .populate('userId', 'name email')
    .populate('ruleId', 'name type severity')
    .lean();
};

/**
 * Get high-risk events
 */
anomalyEventSchema.statics.getHighRiskEvents = async function(scoreThreshold = 70) {
  return await this.find({
    score: { $gte: scoreThreshold },
    status: 'pending'
  })
    .sort({ score: -1 })
    .populate('userId', 'name email')
    .populate('transactionId', 'amount category merchant')
    .lean();
};

/**
 * Get events by rule
 */
anomalyEventSchema.statics.getEventsByRule = async function(ruleId, startDate = null, endDate = null) {
  const query = { ruleId };
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  
  return await this.find(query)
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Get events requiring attention
 */
anomalyEventSchema.statics.getEventsRequiringAttention = async function() {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  
  return await this.find({
    status: { $in: ['pending', 'escalated'] },
    $or: [
      { score: { $gte: 70 } },
      { severity: { $in: ['high', 'critical'] } },
      { createdAt: { $lte: fortyEightHoursAgo } }
    ]
  })
    .sort({ score: -1, createdAt: 1 })
    .populate('userId', 'name email')
    .populate('investigation.assignedTo', 'name email')
    .lean();
};

/**
 * Get statistics
 */
anomalyEventSchema.statics.getStatistics = async function(startDate = null, endDate = null) {
  const matchQuery = {};
  
  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = startDate;
    if (endDate) matchQuery.createdAt.$lte = endDate;
  }
  
  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        confirmedFraud: {
          $sum: { $cond: [{ $eq: ['$status', 'confirmed_fraud'] }, 1, 0] }
        },
        falsePositives: {
          $sum: { $cond: [{ $eq: ['$status', 'false_positive'] }, 1, 0] }
        },
        resolved: {
          $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
        },
        avgScore: { $avg: '$score' },
        totalPotentialLoss: { $sum: '$financialImpact.potentialLoss' },
        totalActualLoss: { $sum: '$financialImpact.actualLoss' },
        totalPreventedLoss: { $sum: '$financialImpact.preventedLoss' }
      }
    }
  ]);
  
  if (stats.length === 0) {
    return {
      totalEvents: 0,
      pending: 0,
      confirmedFraud: 0,
      falsePositives: 0,
      resolved: 0,
      avgScore: 0,
      accuracy: 0,
      totalPotentialLoss: 0,
      totalActualLoss: 0,
      totalPreventedLoss: 0
    };
  }
  
  const result = stats[0];
  const reviewed = result.confirmedFraud + result.falsePositives;
  result.accuracy = reviewed > 0 ? (result.confirmedFraud / reviewed) * 100 : 0;
  
  return result;
};

/**
 * Get events by type statistics
 */
anomalyEventSchema.statics.getTypeStatistics = async function() {
  return await this.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        avgScore: { $avg: '$score' },
        confirmed: {
          $sum: { $cond: [{ $eq: ['$status', 'confirmed_fraud'] }, 1, 0] }
        },
        falsePositives: {
          $sum: { $cond: [{ $eq: ['$status', 'false_positive'] }, 1, 0] }
        }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

/**
 * Auto-resolve old low-risk events
 */
anomalyEventSchema.statics.autoResolveOldEvents = async function(daysOld = 30, maxScore = 40) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  
  const events = await this.find({
    status: 'pending',
    score: { $lte: maxScore },
    createdAt: { $lte: cutoffDate }
  });
  
  const results = {
    resolved: 0,
    failed: 0
  };
  
  for (const event of events) {
    try {
      await event.autoResolve(`Auto-resolved: Low risk event older than ${daysOld} days`);
      results.resolved++;
    } catch (error) {
      results.failed++;
    }
  }
  
  return results;
};

const AnomalyEvent = mongoose.model('AnomalyEvent', anomalyEventSchema);

module.exports = AnomalyEvent;
