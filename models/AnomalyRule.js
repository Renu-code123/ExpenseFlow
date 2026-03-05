const mongoose = require('mongoose');

/**
 * AnomalyRule Schema
 * Defines rules for detecting suspicious transactions and unusual patterns
 */
const anomalyRuleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Rule name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  type: {
    type: String,
    required: [true, 'Rule type is required'],
    enum: {
      values: ['threshold', 'pattern', 'velocity', 'geo', 'behavioral'],
      message: '{VALUE} is not a valid rule type'
    }
  },
  conditions: {
    // Flexible JSON structure for different rule types
    // threshold: { field, operator, value }
    // pattern: { sequence, window, threshold }
    // velocity: { transactions, timeWindow, maxCount }
    // geo: { allowedCountries, blockedCountries, distanceThreshold }
    // behavioral: { deviationThreshold, profileFields }
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    required: [true, 'Rule conditions are required'],
    validate: {
      validator: function(conditions) {
        return conditions && conditions.size > 0;
      },
      message: 'At least one condition must be specified'
    }
  },
  severity: {
    type: String,
    required: [true, 'Severity level is required'],
    enum: {
      values: ['low', 'medium', 'high', 'critical'],
      message: '{VALUE} is not a valid severity level'
    },
    default: 'medium'
  },
  action: {
    type: String,
    required: [true, 'Action is required'],
    enum: {
      values: ['alert', 'block', 'review'],
      message: '{VALUE} is not a valid action'
    },
    default: 'alert'
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  priority: {
    type: Number,
    default: 50,
    min: [1, 'Priority must be at least 1'],
    max: [100, 'Priority cannot exceed 100']
  },
  // Rule effectiveness metrics
  detections: {
    total: { type: Number, default: 0 },
    truePositives: { type: Number, default: 0 },
    falsePositives: { type: Number, default: 0 },
    pending: { type: Number, default: 0 }
  },
  accuracy: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  lastTriggered: {
    type: Date
  },
  cooldownPeriod: {
    // Minimum time between triggers for same user (in minutes)
    type: Number,
    default: 0,
    min: [0, 'Cooldown period cannot be negative']
  },
  notificationChannels: [{
    type: String,
    enum: ['email', 'sms', 'push', 'webhook']
  }],
  tags: [{
    type: String,
    trim: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
anomalyRuleSchema.index({ type: 1, isActive: 1 });
anomalyRuleSchema.index({ severity: 1, isActive: 1 });
anomalyRuleSchema.index({ createdBy: 1 });
anomalyRuleSchema.index({ tags: 1 });
anomalyRuleSchema.index({ accuracy: -1 });

// Virtual for effectiveness rate
anomalyRuleSchema.virtual('effectivenessRate').get(function() {
  const total = this.detections.truePositives + this.detections.falsePositives;
  if (total === 0) return 0;
  return (this.detections.truePositives / total) * 100;
});

// Virtual for false positive rate
anomalyRuleSchema.virtual('falsePositiveRate').get(function() {
  const total = this.detections.truePositives + this.detections.falsePositives;
  if (total === 0) return 0;
  return (this.detections.falsePositives / total) * 100;
});

// Methods

/**
 * Record detection result
 */
anomalyRuleSchema.methods.recordDetection = async function(isFraud) {
  this.detections.total += 1;
  this.lastTriggered = new Date();
  
  if (isFraud === true) {
    this.detections.truePositives += 1;
  } else if (isFraud === false) {
    this.detections.falsePositives += 1;
  } else {
    this.detections.pending += 1;
  }
  
  // Update accuracy
  const reviewed = this.detections.truePositives + this.detections.falsePositives;
  if (reviewed > 0) {
    this.accuracy = (this.detections.truePositives / reviewed) * 100;
  }
  
  return await this.save();
};

/**
 * Update detection status from pending to confirmed
 */
anomalyRuleSchema.methods.updateDetectionStatus = async function(isFraud) {
  if (this.detections.pending > 0) {
    this.detections.pending -= 1;
    
    if (isFraud) {
      this.detections.truePositives += 1;
    } else {
      this.detections.falsePositives += 1;
    }
    
    // Recalculate accuracy
    const reviewed = this.detections.truePositives + this.detections.falsePositives;
    if (reviewed > 0) {
      this.accuracy = (this.detections.truePositives / reviewed) * 100;
    }
    
    return await this.save();
  }
  return this;
};

/**
 * Check if rule is in cooldown for a specific user
 */
anomalyRuleSchema.methods.isInCooldown = function(userId) {
  if (!this.cooldownPeriod || this.cooldownPeriod === 0) return false;
  if (!this.lastTriggered) return false;
  
  const cooldownMs = this.cooldownPeriod * 60 * 1000;
  const timeSinceLastTrigger = Date.now() - this.lastTriggered.getTime();
  
  return timeSinceLastTrigger < cooldownMs;
};

/**
 * Evaluate if conditions match transaction data
 */
anomalyRuleSchema.methods.evaluate = function(transactionData, userProfile) {
  if (!this.isActive) return false;
  
  switch (this.type) {
    case 'threshold':
      return this.evaluateThreshold(transactionData);
    case 'velocity':
      return this.evaluateVelocity(transactionData);
    case 'pattern':
      return this.evaluatePattern(transactionData);
    case 'geo':
      return this.evaluateGeo(transactionData);
    case 'behavioral':
      return this.evaluateBehavioral(transactionData, userProfile);
    default:
      return false;
  }
};

/**
 * Evaluate threshold conditions
 */
anomalyRuleSchema.methods.evaluateThreshold = function(data) {
  const field = this.conditions.get('field');
  const operator = this.conditions.get('operator');
  const value = this.conditions.get('value');
  
  const actualValue = data[field];
  if (actualValue === undefined) return false;
  
  switch (operator) {
    case '>': return actualValue > value;
    case '>=': return actualValue >= value;
    case '<': return actualValue < value;
    case '<=': return actualValue <= value;
    case '==': return actualValue == value;
    case '!=': return actualValue != value;
    default: return false;
  }
};

/**
 * Evaluate velocity conditions
 */
anomalyRuleSchema.methods.evaluateVelocity = function(data) {
  // This requires historical transaction data
  // Should be implemented in the service layer
  return data.velocityScore !== undefined && data.velocityScore > (this.conditions.get('threshold') || 80);
};

/**
 * Evaluate pattern conditions
 */
anomalyRuleSchema.methods.evaluatePattern = function(data) {
  // Pattern detection requires sequence analysis
  // Should be implemented in the service layer
  return data.patternScore !== undefined && data.patternScore > (this.conditions.get('threshold') || 80);
};

/**
 * Evaluate geo conditions
 */
anomalyRuleSchema.methods.evaluateGeo = function(data) {
  const allowedCountries = this.conditions.get('allowedCountries');
  const blockedCountries = this.conditions.get('blockedCountries');
  const country = data.country || data.location?.country;
  
  if (!country) return false;
  
  if (blockedCountries && blockedCountries.includes(country)) {
    return true; // Trigger on blocked country
  }
  
  if (allowedCountries && allowedCountries.length > 0) {
    return !allowedCountries.includes(country); // Trigger if not in allowed list
  }
  
  return false;
};

/**
 * Evaluate behavioral conditions
 */
anomalyRuleSchema.methods.evaluateBehavioral = function(data, userProfile) {
  if (!userProfile) return false;
  
  const threshold = this.conditions.get('deviationThreshold') || 2.5;
  const behavioralScore = data.behavioralScore || 0;
  
  return behavioralScore > threshold;
};

/**
 * Get severity weight for scoring
 */
anomalyRuleSchema.methods.getSeverityWeight = function() {
  const weights = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 5
  };
  return weights[this.severity] || 1;
};

/**
 * Clone rule with new name
 */
anomalyRuleSchema.methods.clone = async function(newName, userId) {
  const Rule = this.constructor;
  
  const clonedRule = new Rule({
    name: newName,
    description: this.description,
    type: this.type,
    conditions: this.conditions,
    severity: this.severity,
    action: this.action,
    isActive: false, // Start as inactive
    priority: this.priority,
    cooldownPeriod: this.cooldownPeriod,
    notificationChannels: this.notificationChannels,
    tags: [...this.tags, 'cloned'],
    createdBy: userId
  });
  
  return await clonedRule.save();
};

// Static methods

/**
 * Get active rules for evaluation
 */
anomalyRuleSchema.statics.getActiveRules = async function(type = null) {
  const query = { isActive: true };
  if (type) query.type = type;
  
  return await this.find(query)
    .sort({ priority: -1, severity: -1 })
    .lean();
};

/**
 * Get rules by severity
 */
anomalyRuleSchema.statics.getRulesBySeverity = async function(severity) {
  return await this.find({ severity, isActive: true })
    .sort({ priority: -1 })
    .lean();
};

/**
 * Get rules by creator
 */
anomalyRuleSchema.statics.getRulesByCreator = async function(userId) {
  return await this.find({ createdBy: userId })
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Get top performing rules
 */
anomalyRuleSchema.statics.getTopPerformingRules = async function(limit = 10) {
  return await this.find({
    isActive: true,
    'detections.total': { $gte: 10 } // Minimum detections for statistical significance
  })
    .sort({ accuracy: -1, 'detections.truePositives': -1 })
    .limit(limit)
    .lean();
};

/**
 * Get underperforming rules
 */
anomalyRuleSchema.statics.getUnderperformingRules = async function(accuracyThreshold = 50) {
  return await this.find({
    isActive: true,
    accuracy: { $lt: accuracyThreshold },
    'detections.total': { $gte: 20 } // Minimum detections
  })
    .sort({ accuracy: 1 })
    .lean();
};

/**
 * Get rules statistics
 */
anomalyRuleSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalRules: { $sum: 1 },
        activeRules: {
          $sum: { $cond: ['$isActive', 1, 0] }
        },
        totalDetections: { $sum: '$detections.total' },
        truePositives: { $sum: '$detections.truePositives' },
        falsePositives: { $sum: '$detections.falsePositives' },
        pending: { $sum: '$detections.pending' },
        avgAccuracy: { $avg: '$accuracy' }
      }
    }
  ]);
  
  if (stats.length === 0) {
    return {
      totalRules: 0,
      activeRules: 0,
      totalDetections: 0,
      truePositives: 0,
      falsePositives: 0,
      pending: 0,
      avgAccuracy: 0,
      overallAccuracy: 0
    };
  }
  
  const result = stats[0];
  const reviewed = result.truePositives + result.falsePositives;
  result.overallAccuracy = reviewed > 0 ? (result.truePositives / reviewed) * 100 : 0;
  
  return result;
};

/**
 * Get rules by type statistics
 */
anomalyRuleSchema.statics.getTypeStatistics = async function() {
  return await this.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        active: {
          $sum: { $cond: ['$isActive', 1, 0] }
        },
        totalDetections: { $sum: '$detections.total' },
        avgAccuracy: { $avg: '$accuracy' }
      }
    },
    { $sort: { totalDetections: -1 } }
  ]);
};

const AnomalyRule = mongoose.model('AnomalyRule', anomalyRuleSchema);

module.exports = AnomalyRule;
