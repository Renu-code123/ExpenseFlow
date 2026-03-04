const mongoose = require('mongoose');

const financialAlertSchema = new mongoose.Schema(
  {
    // User reference
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Alert identification
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: String,

    // Alert type
    type: {
      type: String,
      enum: [
        'low_balance',
        'high_spend',
        'goal_risk',
        'bill_conflict',
        'unusual_activity',
        'budget_exceeded',
        'income_delay',
        'overdraft_risk',
        'savings_shortfall',
        'debt_warning',
        'opportunity',
        'custom'
      ],
      required: true,
      index: true
    },

    // Severity level
    severity: {
      type: String,
      enum: ['info', 'low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true
    },
    priority: {
      type: Number,
      min: 1,
      max: 10,
      default: 5,
      description: 'Priority score (1=lowest, 10=highest)'
    },

    // Timing
    predictedDate: {
      type: Date,
      index: true,
      description: 'When the condition is predicted to occur'
    },
    detectedAt: {
      type: Date,
      default: Date.now,
      description: 'When the alert was generated'
    },
    expiresAt: {
      type: Date,
      description: 'When this alert becomes irrelevant'
    },
    daysUntilEvent: {
      type: Number,
      description: 'Days until predicted event'
    },

    // Financial impact
    amount: {
      type: Number,
      description: 'Monetary amount related to alert'
    },
    currency: {
      type: String,
      default: 'USD'
    },
    impactEstimate: {
      min: Number,
      max: Number,
      likely: Number
    },

    // Context and details
    category: String,
    relatedEntity: {
      type: {
        type: String,
        enum: ['expense', 'income', 'budget', 'goal', 'bill', 'account', 'forecast']
      },
      entityId: mongoose.Schema.Types.ObjectId,
      entityName: String
    },

    // Alert details
    currentValue: mongoose.Schema.Types.Mixed,
    thresholdValue: mongoose.Schema.Types.Mixed,
    variance: {
      type: Number,
      description: 'Difference from expected value'
    },
    percentageChange: Number,

    // Conditions that triggered alert
    triggers: {
      type: [
        {
          condition: String,
          value: mongoose.Schema.Types.Mixed,
          threshold: mongoose.Schema.Types.Mixed,
          metAt: Date
        }
      ],
      default: []
    },

    // Recommendation
    recommendation: {
      action: {
        type: String,
        required: true
      },
      description: String,
      steps: [String],
      expectedBenefit: Number,
      urgency: {
        type: String,
        enum: ['immediate', 'this_week', 'this_month', 'when_possible']
      }
    },

    // Alternative actions
    alternatives: {
      type: [
        {
          action: String,
          description: String,
          pros: [String],
          cons: [String],
          expectedBenefit: Number
        }
      ],
      default: []
    },

    // Forecast reference
    forecastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashFlowForecast'
    },
    scenarioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ForecastScenario'
    },

    // User response
    acknowledged: {
      type: Boolean,
      default: false,
      index: true
    },
    acknowledgedAt: Date,
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    actionTaken: {
      taken: {
        type: Boolean,
        default: false
      },
      action: String,
      takenAt: Date,
      notes: String
    },

    dismissed: {
      type: Boolean,
      default: false
    },
    dismissedAt: Date,
    dismissReason: String,

    // Follow-up
    requiresFollowUp: {
      type: Boolean,
      default: false
    },
    followUpDate: Date,
    followUpCompleted: {
      type: Boolean,
      default: false
    },

    // Recurrence
    isRecurring: {
      type: Boolean,
      default: false
    },
    recurrencePattern: {
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'custom']
      },
      nextOccurrence: Date
    },
    previousOccurrence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinancialAlert'
    },

    // Notification
    notificationSent: {
      type: Boolean,
      default: false
    },
    notificationMethods: {
      type: [String],
      enum: ['email', 'push', 'sms', 'in_app'],
      default: ['in_app']
    },
    notificationSentAt: Date,

    // Resolution
    resolved: {
      type: Boolean,
      default: false,
      index: true
    },
    resolvedAt: Date,
    resolution: String,
    autoResolved: {
      type: Boolean,
      default: false
    },

    // Impact tracking
    actualImpact: {
      occurred: {
        type: Boolean,
        default: false
      },
      amount: Number,
      date: Date,
      notes: String
    },

    // Machine learning feedback
    feedback: {
      useful: {
        type: Boolean,
        default: null
      },
      accurate: {
        type: Boolean,
        default: null
      },
      comment: String,
      providedAt: Date
    },

    // Metadata
    source: {
      type: String,
      enum: ['forecast', 'pattern_detection', 'rule_engine', 'manual', 'ml_model'],
      default: 'forecast'
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      description: 'Confidence in prediction accuracy'
    },
    tags: [String],
    metadata: mongoose.Schema.Types.Mixed
  },
  {
    timestamps: true,
    collection: 'financial_alerts'
  }
);

// Indexes
financialAlertSchema.index({ user: 1, acknowledged: 1 });
financialAlertSchema.index({ user: 1, type: 1, severity: 1 });
financialAlertSchema.index({ user: 1, resolved: 1 });
financialAlertSchema.index({ predictedDate: 1 });
financialAlertSchema.index({ detectedAt: -1 });
financialAlertSchema.index({ priority: -1 });
financialAlertSchema.index({ severity: 1, acknowledged: 1 });

// Methods
financialAlertSchema.methods.acknowledge = function(userId) {
  this.acknowledged = true;
  this.acknowledgedAt = new Date();
  this.acknowledgedBy = userId;
  return this.save();
};

financialAlertSchema.methods.dismiss = function(reason) {
  this.dismissed = true;
  this.dismissedAt = new Date();
  this.dismissReason = reason;
  this.resolved = true;
  this.resolvedAt = new Date();
  return this.save();
};

financialAlertSchema.methods.recordAction = function(action, notes) {
  this.actionTaken = {
    taken: true,
    action,
    takenAt: new Date(),
    notes
  };
  return this.save();
};

financialAlertSchema.methods.resolve = function(resolution, autoResolved = false) {
  this.resolved = true;
  this.resolvedAt = new Date();
  this.resolution = resolution;
  this.autoResolved = autoResolved;
  return this.save();
};

financialAlertSchema.methods.recordActualImpact = function(occurred, amount, notes) {
  this.actualImpact = {
    occurred,
    amount,
    date: new Date(),
    notes
  };
  
  // If predicted impact was accurate, increase confidence
  if (this.amount && amount) {
    const error = Math.abs((amount - this.amount) / this.amount);
    if (error < 0.1) { // Within 10%
      this.confidence = Math.min(1, (this.confidence || 0.5) + 0.1);
    }
  }
  
  return this.save();
};

financialAlertSchema.methods.provideFeedback = function(useful, accurate, comment) {
  this.feedback = {
    useful,
    accurate,
    comment,
    providedAt: new Date()
  };
  return this.save();
};

financialAlertSchema.methods.isExpired = function() {
  return this.expiresAt && this.expiresAt < new Date();
};

financialAlertSchema.methods.isUrgent = function() {
  return this.severity === 'critical' || this.severity === 'high';
};

financialAlertSchema.methods.getDaysUntilEvent = function() {
  if (!this.predictedDate) return null;
  const days = Math.ceil((this.predictedDate - new Date()) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
};

financialAlertSchema.methods.scheduleFollowUp = function(days) {
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + days);
  this.requiresFollowUp = true;
  this.followUpDate = followUpDate;
  return this.save();
};

financialAlertSchema.methods.markNotificationSent = function(methods = ['in_app']) {
  this.notificationSent = true;
  this.notificationMethods = methods;
  this.notificationSentAt = new Date();
  return this.save();
};

// Static methods
financialAlertSchema.statics.getUserAlerts = function(userId, includeResolved = false) {
  const query = { user: userId };
  if (!includeResolved) {
    query.resolved = false;
  }
  return this.find(query).sort({ priority: -1, detectedAt: -1 });
};

financialAlertSchema.statics.getUnacknowledgedAlerts = function(userId) {
  return this.find({
    user: userId,
    acknowledged: false,
    resolved: false
  }).sort({ severity: -1, priority: -1 });
};

financialAlertSchema.statics.getCriticalAlerts = function(userId) {
  return this.find({
    user: userId,
    severity: { $in: ['critical', 'high'] },
    resolved: false
  });
};

financialAlertSchema.statics.getAlertsByType = function(userId, type) {
  return this.find({
    user: userId,
    type,
    resolved: false
  });
};

financialAlertSchema.statics.getUpcomingAlerts = function(userId, days = 7) {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  
  return this.find({
    user: userId,
    predictedDate: {
      $gte: new Date(),
      $lte: endDate
    },
    resolved: false
  }).sort({ predictedDate: 1 });
};

financialAlertSchema.statics.cleanupExpired = async function() {
  const result = await this.updateMany(
    {
      expiresAt: { $lt: new Date() },
      resolved: false
    },
    {
      $set: {
        resolved: true,
        resolvedAt: new Date(),
        autoResolved: true,
        resolution: 'Expired automatically'
      }
    }
  );
  return result.modifiedCount;
};

financialAlertSchema.statics.getAlertStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const alerts = await this.find({
    user: userId,
    detectedAt: { $gte: startDate }
  });
  
  return {
    total: alerts.length,
    byType: alerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {}),
    bySeverity: alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {}),
    acknowledged: alerts.filter(a => a.acknowledged).length,
    resolved: alerts.filter(a => a.resolved).length,
    actionTaken: alerts.filter(a => a.actionTaken.taken).length
  };
};

module.exports = mongoose.model('FinancialAlert', financialAlertSchema);
