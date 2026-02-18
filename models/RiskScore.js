const mongoose = require('mongoose');

/**
 * RiskScore Schema
 * Calculates and tracks overall user risk levels
 */
const riskScoreSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  overallScore: {
    type: Number,
    required: [true, 'Overall score is required'],
    min: [0, 'Score must be between 0 and 100'],
    max: [100, 'Score must be between 0 and 100'],
    index: true
  },
  riskLevel: {
    type: String,
    enum: ['minimal', 'low', 'medium', 'high', 'critical'],
    required: true,
    index: true
  },
  // Individual risk factors
  factors: [{
    name: {
      type: String,
      required: true,
      enum: [
        'transaction_velocity',
        'high_value_transactions',
        'unusual_patterns',
        'geographic_risk',
        'behavioral_deviation',
        'device_anomalies',
        'merchant_risk',
        'account_age',
        'verification_status',
        'historical_fraud',
        'failed_transactions',
        'suspicious_activities',
        'chargebacks',
        'multiple_devices',
        'vpn_proxy_usage',
        'blacklist_hits'
      ]
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      required: true
    },
    weight: {
      type: Number,
      min: 0,
      max: 1,
      required: true
    },
    description: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    evidence: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }],
  // Historical tracking
  scoreHistory: [{
    score: Number,
    timestamp: {
      type: Date,
      default: Date.now
    },
    triggerEvent: String,
    changedFactors: [String]
  }],
  trend: {
    type: String,
    enum: ['increasing', 'stable', 'decreasing'],
    default: 'stable',
    index: true
  },
  trendPercentage: {
    // Percentage change over last 7 days
    type: Number,
    default: 0
  },
  // Prediction
  predictedScore: {
    next7Days: Number,
    next30Days: Number,
    confidence: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  // Thresholds and alerts
  thresholds: {
    warning: {
      type: Number,
      default: 60
    },
    critical: {
      type: Number,
      default: 80
    }
  },
  alerts: [{
    level: {
      type: String,
      enum: ['warning', 'critical']
    },
    triggeredAt: {
      type: Date,
      default: Date.now
    },
    acknowledged: {
      type: Boolean,
      default: false
    },
    acknowledgedAt: Date,
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  // Mitigation actions
  mitigationActions: [{
    action: {
      type: String,
      enum: [
        'increase_monitoring',
        'require_verification',
        'limit_transactions',
        'manual_review',
        'account_restriction',
        'enhanced_authentication',
        'contact_user'
      ]
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'failed'],
      default: 'pending'
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    completedAt: Date,
    notes: String
  }],
  // Compliance and regulations
  complianceFlags: [{
    regulation: {
      type: String,
      enum: ['AML', 'KYC', 'PSD2', 'GDPR', 'PCI_DSS']
    },
    status: {
      type: String,
      enum: ['compliant', 'warning', 'violation']
    },
    details: String,
    flaggedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Metadata
  calculatedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastRecalculated: {
    type: Date,
    default: Date.now
  },
  calculationMethod: {
    type: String,
    enum: ['weighted_average', 'ml_model', 'rule_based', 'hybrid'],
    default: 'weighted_average'
  },
  modelVersion: {
    type: String,
    default: '1.0'
  },
  confidenceScore: {
    // Confidence in the risk score accuracy
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },
  // Review status
  reviewRequired: {
    type: Boolean,
    default: false,
    index: true
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNotes: String,
  // External data integration
  externalRiskData: {
    creditScore: Number,
    fraudDatabases: [{
      source: String,
      score: Number,
      lastChecked: Date
    }],
    identityVerification: {
      verified: Boolean,
      verifiedAt: Date,
      provider: String
    }
  }
}, {
  timestamps: true
});

// Indexes
riskScoreSchema.index({ userId: 1, calculatedAt: -1 });
riskScoreSchema.index({ overallScore: -1, calculatedAt: -1 });
riskScoreSchema.index({ riskLevel: 1, reviewRequired: 1 });
riskScoreSchema.index({ trend: 1, overallScore: -1 });

// Compound indexes for complex queries
riskScoreSchema.index({ userId: 1, riskLevel: 1 });
riskScoreSchema.index({ 'alerts.acknowledged': 1, 'alerts.level': 1 });

// Virtual for is high risk
riskScoreSchema.virtual('isHighRisk').get(function() {
  return this.overallScore >= this.thresholds.critical;
});

// Virtual for requires action
riskScoreSchema.virtual('requiresAction').get(function() {
  return this.overallScore >= this.thresholds.warning || this.reviewRequired;
});

// Virtual for unacknowledged alerts
riskScoreSchema.virtual('unacknowledgedAlerts').get(function() {
  return this.alerts.filter(a => !a.acknowledged);
});

// Methods

/**
 * Calculate overall score from factors
 */
riskScoreSchema.methods.calculateOverallScore = function() {
  if (this.factors.length === 0) {
    this.overallScore = 0;
    this.riskLevel = 'minimal';
    return;
  }
  
  let weightedSum = 0;
  let totalWeight = 0;
  
  for (const factor of this.factors) {
    weightedSum += factor.score * factor.weight;
    totalWeight += factor.weight;
  }
  
  this.overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  
  // Update risk level
  if (this.overallScore >= 80) {
    this.riskLevel = 'critical';
  } else if (this.overallScore >= 65) {
    this.riskLevel = 'high';
  } else if (this.overallScore >= 40) {
    this.riskLevel = 'medium';
  } else if (this.overallScore >= 20) {
    this.riskLevel = 'low';
  } else {
    this.riskLevel = 'minimal';
  }
};

/**
 * Add or update a risk factor
 */
riskScoreSchema.methods.updateFactor = function(name, score, weight, description, evidence = {}) {
  let factor = this.factors.find(f => f.name === name);
  
  if (!factor) {
    factor = {
      name,
      score,
      weight,
      description,
      evidence: new Map(Object.entries(evidence)),
      lastUpdated: new Date()
    };
    this.factors.push(factor);
  } else {
    const oldScore = factor.score;
    factor.score = score;
    factor.weight = weight;
    factor.description = description;
    factor.evidence = new Map(Object.entries(evidence));
    factor.lastUpdated = new Date();
    
    // Record in history if significant change
    if (Math.abs(oldScore - score) >= 10) {
      this.recordScoreChange(name);
    }
  }
  
  // Determine severity
  if (score >= 80) {
    factor.severity = 'critical';
  } else if (score >= 60) {
    factor.severity = 'high';
  } else if (score >= 40) {
    factor.severity = 'medium';
  } else {
    factor.severity = 'low';
  }
  
  this.calculateOverallScore();
};

/**
 * Remove a risk factor
 */
riskScoreSchema.methods.removeFactor = function(name) {
  this.factors = this.factors.filter(f => f.name !== name);
  this.calculateOverallScore();
};

/**
 * Record score change in history
 */
riskScoreSchema.methods.recordScoreChange = function(triggerEvent = null, changedFactors = []) {
  this.scoreHistory.push({
    score: this.overallScore,
    timestamp: new Date(),
    triggerEvent,
    changedFactors
  });
  
  // Keep only last 100 entries
  if (this.scoreHistory.length > 100) {
    this.scoreHistory = this.scoreHistory.slice(-100);
  }
  
  // Update trend
  this.updateTrend();
};

/**
 * Update trend based on recent history
 */
riskScoreSchema.methods.updateTrend = function() {
  if (this.scoreHistory.length < 2) {
    this.trend = 'stable';
    this.trendPercentage = 0;
    return;
  }
  
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentScores = this.scoreHistory
    .filter(h => h.timestamp >= sevenDaysAgo)
    .map(h => h.score);
  
  if (recentScores.length < 2) {
    this.trend = 'stable';
    this.trendPercentage = 0;
    return;
  }
  
  const oldScore = recentScores[0];
  const newScore = recentScores[recentScores.length - 1];
  const change = newScore - oldScore;
  const changePercent = oldScore > 0 ? (change / oldScore) * 100 : 0;
  
  this.trendPercentage = Math.round(changePercent);
  
  if (changePercent > 10) {
    this.trend = 'increasing';
  } else if (changePercent < -10) {
    this.trend = 'decreasing';
  } else {
    this.trend = 'stable';
  }
};

/**
 * Check and trigger alerts
 */
riskScoreSchema.methods.checkAlerts = function() {
  const currentScore = this.overallScore;
  
  // Check for critical alert
  if (currentScore >= this.thresholds.critical) {
    const existingCritical = this.alerts.find(
      a => a.level === 'critical' && !a.acknowledged
    );
    
    if (!existingCritical) {
      this.alerts.push({
        level: 'critical',
        triggeredAt: new Date(),
        acknowledged: false
      });
    }
  }
  
  // Check for warning alert
  else if (currentScore >= this.thresholds.warning) {
    const existingWarning = this.alerts.find(
      a => a.level === 'warning' && !a.acknowledged
    );
    
    if (!existingWarning) {
      this.alerts.push({
        level: 'warning',
        triggeredAt: new Date(),
        acknowledged: false
      });
    }
  }
};

/**
 * Acknowledge alert
 */
riskScoreSchema.methods.acknowledgeAlert = function(alertId, userId) {
  const alert = this.alerts.id(alertId);
  
  if (alert && !alert.acknowledged) {
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = userId;
  }
};

/**
 * Add mitigation action
 */
riskScoreSchema.methods.addMitigationAction = function(action, assignedTo = null, notes = null) {
  this.mitigationActions.push({
    action,
    status: 'pending',
    assignedTo,
    notes,
    createdAt: new Date()
  });
};

/**
 * Update mitigation action status
 */
riskScoreSchema.methods.updateMitigationAction = function(actionId, status, notes = null) {
  const action = this.mitigationActions.id(actionId);
  
  if (action) {
    action.status = status;
    if (notes) action.notes = notes;
    if (status === 'completed') {
      action.completedAt = new Date();
    }
  }
};

/**
 * Get top risk factors
 */
riskScoreSchema.methods.getTopRiskFactors = function(limit = 5) {
  return this.factors
    .sort((a, b) => (b.score * b.weight) - (a.score * a.weight))
    .slice(0, limit);
};

/**
 * Get recommended actions
 */
riskScoreSchema.methods.getRecommendedActions = function() {
  const recommendations = [];
  
  if (this.overallScore >= 80) {
    recommendations.push('account_restriction', 'manual_review', 'contact_user');
  } else if (this.overallScore >= 65) {
    recommendations.push('require_verification', 'increase_monitoring', 'enhanced_authentication');
  } else if (this.overallScore >= 40) {
    recommendations.push('increase_monitoring', 'require_verification');
  }
  
  // Check specific factors
  const highRiskFactors = this.factors.filter(f => f.score >= 70);
  for (const factor of highRiskFactors) {
    if (factor.name === 'transaction_velocity') {
      recommendations.push('limit_transactions');
    }
    if (factor.name === 'device_anomalies') {
      recommendations.push('enhanced_authentication');
    }
  }
  
  return [...new Set(recommendations)]; // Remove duplicates
};

/**
 * Mark for review
 */
riskScoreSchema.methods.markForReview = function(reason = null) {
  this.reviewRequired = true;
  if (reason) {
    this.reviewNotes = reason;
  }
};

/**
 * Complete review
 */
riskScoreSchema.methods.completeReview = function(reviewerId, notes) {
  this.reviewRequired = false;
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  this.reviewNotes = notes;
};

// Static methods

/**
 * Get latest risk score for user
 */
riskScoreSchema.statics.getLatestForUser = async function(userId) {
  return await this.findOne({ userId })
    .sort({ calculatedAt: -1 })
    .populate('userId', 'name email');
};

/**
 * Get high risk users
 */
riskScoreSchema.statics.getHighRiskUsers = async function(threshold = 65) {
  return await this.aggregate([
    {
      $sort: { userId: 1, calculatedAt: -1 }
    },
    {
      $group: {
        _id: '$userId',
        latestScore: { $first: '$$ROOT' }
      }
    },
    {
      $replaceRoot: { newRoot: '$latestScore' }
    },
    {
      $match: { overallScore: { $gte: threshold } }
    },
    {
      $sort: { overallScore: -1 }
    }
  ]);
};

/**
 * Get users requiring review
 */
riskScoreSchema.statics.getUsersRequiringReview = async function() {
  return await this.aggregate([
    {
      $sort: { userId: 1, calculatedAt: -1 }
    },
    {
      $group: {
        _id: '$userId',
        latestScore: { $first: '$$ROOT' }
      }
    },
    {
      $replaceRoot: { newRoot: '$latestScore' }
    },
    {
      $match: { reviewRequired: true }
    },
    {
      $sort: { overallScore: -1 }
    }
  ]);
};

/**
 * Get risk distribution statistics
 */
riskScoreSchema.statics.getRiskDistribution = async function() {
  const latestScores = await this.aggregate([
    {
      $sort: { userId: 1, calculatedAt: -1 }
    },
    {
      $group: {
        _id: '$userId',
        latestScore: { $first: '$$ROOT' }
      }
    },
    {
      $replaceRoot: { newRoot: '$latestScore' }
    },
    {
      $group: {
        _id: '$riskLevel',
        count: { $sum: 1 },
        avgScore: { $avg: '$overallScore' }
      }
    }
  ]);
  
  return latestScores;
};

/**
 * Get trending risk users
 */
riskScoreSchema.statics.getTrendingRiskUsers = async function(trendType = 'increasing') {
  return await this.aggregate([
    {
      $sort: { userId: 1, calculatedAt: -1 }
    },
    {
      $group: {
        _id: '$userId',
        latestScore: { $first: '$$ROOT' }
      }
    },
    {
      $replaceRoot: { newRoot: '$latestScore' }
    },
    {
      $match: { trend: trendType }
    },
    {
      $sort: { trendPercentage: -1 }
    }
  ]);
};

/**
 * Get users with unacknowledged alerts
 */
riskScoreSchema.statics.getUsersWithUnacknowledgedAlerts = async function() {
  return await this.find({
    'alerts.acknowledged': false
  })
    .sort({ 'alerts.triggeredAt': 1 })
    .populate('userId', 'name email')
    .lean();
};

const RiskScore = mongoose.model('RiskScore', riskScoreSchema);

module.exports = RiskScore;
