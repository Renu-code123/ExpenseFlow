const mongoose = require('mongoose');

const insightSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace'
  },
  type: {
    type: String,
    enum: [
      'velocity_warning',     // Spending too fast
      'budget_prediction',    // Will exceed budget
      'savings_opportunity',  // Found potential savings
      'anomaly_detected',     // Unusual spending pattern
      'category_alert',       // Category overspending
      'income_vs_expense',    // Balance issue
      'recurring_waste',      // Unnecessary recurring charges
      'seasonal_pattern',     // Seasonal spending insight
      'goal_progress',        // Goal achievement update
      'health_score_drop',    // Health score decreased
      'positive_trend',       // Good financial behavior
      'recommendation'        // General recommendation
    ],
    required: true
  },
  priority: {
    type: String,
    enum: ['critical', 'high', 'medium', 'low', 'info'],
    default: 'medium',
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  category: {
    type: String,
    enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'education', 'other']
  },
  metrics: {
    current_velocity: Number,        // Current spending rate
    expected_velocity: Number,       // Expected spending rate
    velocity_change_percent: Number, // % change from normal
    budget_utilization: Number,      // % of budget used
    days_until_budget_exhausted: Number,
    potential_savings: Number,
    amount_at_risk: Number,
    health_score_impact: Number     // Impact on health score (-100 to +100)
  },
  actionable: {
    type: Boolean,
    default: true
  },
  actions: [{
    label: String,
    type: {
      type: String,
      enum: ['reduce_spending', 'adjust_budget', 'review_category', 'cancel_subscription', 'increase_income', 'review_transaction']
    },
    data: mongoose.Schema.Types.Mixed
  }],
  relatedTransactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  }],
  relatedBudget: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Budget'
  },
  relatedGoal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal'
  },
  status: {
    type: String,
    enum: ['active', 'acknowledged', 'resolved', 'dismissed', 'expired'],
    default: 'active',
    index: true
  },
  acknowledgedAt: Date,
  resolvedAt: Date,
  dismissedAt: Date,
  expiresAt: {
    type: Date,
    index: true
  },
  confidence: {
    type: Number,
    min: 0,
    max: 100,
    default: 80
  },
  source: {
    type: String,
    enum: ['auto_analysis', 'velocity_monitor', 'pattern_detection', 'budget_tracker', 'goal_tracker', 'health_calculator', 'manual'],
    default: 'auto_analysis'
  },
  impact: {
    financial: {
      type: String,
      enum: ['positive', 'negative', 'neutral']
    },
    score: Number  // Impact on health score
  },
  visualization: {
    chartType: String,  // 'line', 'bar', 'gauge', 'trend'
    data: mongoose.Schema.Types.Mixed
  },
  metadata: {
    generatedBy: String,
    analysisVersion: String,
    dataPoints: Number,
    timeWindowDays: Number
  }
}, {
  timestamps: true
});

// Indexes for performance
insightSchema.index({ user: 1, status: 1, priority: 1 });
insightSchema.index({ user: 1, type: 1, createdAt: -1 });
insightSchema.index({ user: 1, expiresAt: 1 });
insightSchema.index({ createdAt: -1 });

// Virtual: Is this insight still valid?
insightSchema.virtual('isValid').get(function() {
  if (this.status !== 'active') return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
});

// Virtual: Age of insight in hours
insightSchema.virtual('ageInHours').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60));
});

// Virtual: Urgency score (0-100)
insightSchema.virtual('urgencyScore').get(function() {
  let score = 0;
  
  // Priority weight
  const priorityScores = { critical: 40, high: 30, medium: 20, low: 10, info: 5 };
  score += priorityScores[this.priority] || 0;
  
  // Type weight
  if (['velocity_warning', 'budget_prediction', 'health_score_drop'].includes(this.type)) {
    score += 30;
  }
  
  // Confidence weight
  score += (this.confidence / 100) * 20;
  
  // Time-sensitivity (newer = more urgent)
  const hoursOld = this.ageInHours;
  if (hoursOld < 24) score += 10;
  else if (hoursOld < 72) score += 5;
  
  return Math.min(100, score);
});

// Method: Acknowledge insight
insightSchema.methods.acknowledge = function() {
  this.status = 'acknowledged';
  this.acknowledgedAt = new Date();
  return this.save();
};

// Method: Resolve insight
insightSchema.methods.resolve = function() {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  return this.save();
};

// Method: Dismiss insight
insightSchema.methods.dismiss = function() {
  this.status = 'dismissed';
  this.dismissedAt = new Date();
  return this.save();
};

// Method: Check if expired
insightSchema.methods.checkExpiration = function() {
  if (this.expiresAt && this.expiresAt < new Date() && this.status === 'active') {
    this.status = 'expired';
    return this.save();
  }
  return Promise.resolve(this);
};

// Static: Get active insights for user
insightSchema.statics.getActiveInsights = function(userId, options = {}) {
  const query = {
    user: userId,
    status: 'active',
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  };
  
  if (options.priority) {
    query.priority = options.priority;
  }
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.category) {
    query.category = options.category;
  }
  
  return this.find(query)
    .sort({ priority: 1, createdAt: -1 })
    .limit(options.limit || 50)
    .populate('relatedBudget relatedGoal');
};

// Static: Get insights by priority
insightSchema.statics.getByPriority = function(userId, priority) {
  return this.find({
    user: userId,
    status: 'active',
    priority: priority,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  }).sort({ createdAt: -1 });
};

// Static: Clean up expired insights
insightSchema.statics.cleanupExpired = async function() {
  const result = await this.updateMany(
    {
      status: 'active',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );
  
  return result.modifiedCount;
};

// Static: Get insight statistics
insightSchema.statics.getStatistics = async function(userId) {
  const insights = await this.find({ user: userId, status: 'active' });
  
  const stats = {
    total: insights.length,
    byPriority: {},
    byType: {},
    byCategory: {},
    averageConfidence: 0,
    totalPotentialSavings: 0,
    criticalCount: 0
  };
  
  insights.forEach(insight => {
    // By priority
    stats.byPriority[insight.priority] = (stats.byPriority[insight.priority] || 0) + 1;
    
    // By type
    stats.byType[insight.type] = (stats.byType[insight.type] || 0) + 1;
    
    // By category
    if (insight.category) {
      stats.byCategory[insight.category] = (stats.byCategory[insight.category] || 0) + 1;
    }
    
    // Confidence
    stats.averageConfidence += insight.confidence;
    
    // Potential savings
    if (insight.metrics?.potential_savings) {
      stats.totalPotentialSavings += insight.metrics.potential_savings;
    }
    
    // Critical
    if (insight.priority === 'critical') {
      stats.criticalCount++;
    }
  });
  
  if (insights.length > 0) {
    stats.averageConfidence = Math.round(stats.averageConfidence / insights.length);
  }
  
  return stats;
};

// Auto-expire old insights
insightSchema.pre('save', function(next) {
  // Auto-set expiration for certain types if not set
  if (!this.expiresAt && this.isNew) {
    const expirationDays = {
      velocity_warning: 7,
      budget_prediction: 14,
      savings_opportunity: 30,
      anomaly_detected: 3,
      category_alert: 7,
      positive_trend: 30
    };
    
    const days = expirationDays[this.type] || 30;
    this.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
  
  next();
});

module.exports = mongoose.model('Insight', insightSchema);
