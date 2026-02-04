const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema(
  {
    // Reference to bank link
    bankLink: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankLink',
      required: true,
      index: true
    },
    bankInstitution: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankInstitution',
      required: true,
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Sync timing
    startedAt: {
      type: Date,
      default: Date.now
    },
    completedAt: {
      type: Date,
      default: null
    },
    duration: {
      type: Number,
      default: null,
      description: 'Duration in milliseconds'
    },

    // Sync status
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'success', 'partial', 'failed', 'cancelled'],
      default: 'pending',
      index: true
    },
    statusReason: String,

    // Sync type and scope
    syncType: {
      type: String,
      enum: ['full', 'incremental', 'manual', 'scheduled', 'on_demand'],
      default: 'incremental'
    },
    syncScope: {
      type: String,
      enum: ['all_accounts', 'selected_accounts', 'single_account'],
      default: 'all_accounts'
    },

    // Accounts synced
    accountsRequested: {
      type: [String],
      description: 'Account IDs requested for sync'
    },
    accountsSynced: {
      type: [
        {
          accountId: String,
          status: {
            type: String,
            enum: ['synced', 'skipped', 'error'],
            default: 'synced'
          },
          transactionsImported: Number,
          error: String
        }
      ],
      default: []
    },

    // Transaction processing
    transactionsImported: {
      type: Number,
      default: 0
    },
    transactionsProcessed: {
      type: Number,
      default: 0
    },
    transactionsFailed: {
      type: Number,
      default: 0
    },
    newTransactions: {
      type: Number,
      default: 0,
      description: 'Transactions not seen before'
    },
    duplicateTransactions: {
      type: Number,
      default: 0
    },
    updatedTransactions: {
      type: Number,
      default: 0,
      description: 'Existing transactions with changes'
    },

    // Reconciliation
    reconciliationAttempted: {
      type: Boolean,
      default: false
    },
    transactionsMatched: {
      type: Number,
      default: 0
    },
    expensesCreated: {
      type: Number,
      default: 0
    },
    matchConfidenceAverage: {
      type: Number,
      default: 0
    },

    // Balances
    balanceSyncAttempted: {
      type: Boolean,
      default: false
    },
    balancesSynced: {
      type: Number,
      default: 0
    },
    balancesUpdated: {
      type: Number,
      default: 0
    },

    // Data retrieval
    dateRangeRequested: {
      start: Date,
      end: Date
    },
    dateRangeProcessed: {
      start: Date,
      end: Date
    },
    earliestTransaction: {
      date: Date,
      amount: Number
    },
    latestTransaction: {
      date: Date,
      amount: Number
    },
    totalAmountImported: {
      type: Number,
      default: 0
    },

    // Errors and issues
    errors: {
      type: [
        {
          timestamp: {
            type: Date,
            default: Date.now
          },
          code: String,
          message: String,
          severity: {
            type: String,
            enum: ['error', 'warning', 'info'],
            default: 'error'
          },
          transactionId: String,
          accountId: String,
          details: mongoose.Schema.Types.Mixed
        }
      ],
      default: []
    },
    errorCount: {
      type: Number,
      default: 0
    },
    warningCount: {
      type: Number,
      default: 0
    },

    // API metrics
    apiMetrics: {
      requestCount: {
        type: Number,
        default: 0
      },
      successfulRequests: {
        type: Number,
        default: 0
      },
      failedRequests: {
        type: Number,
        default: 0
      },
      averageResponseTime: {
        type: Number,
        default: 0,
        description: 'Average response time in milliseconds'
      },
      totalDataTransferred: {
        type: Number,
        default: 0,
        description: 'Bytes transferred'
      },
      rateLimitHits: {
        type: Number,
        default: 0
      },
      retryCount: {
        type: Number,
        default: 0
      }
    },

    // Performance metrics
    metrics: {
      transactionProcessingTime: {
        type: Number,
        default: 0,
        description: 'Time spent processing transactions (ms)'
      },
      reconciliationTime: {
        type: Number,
        default: 0,
        description: 'Time spent on reconciliation (ms)'
      },
      databaseOperationTime: {
        type: Number,
        default: 0,
        description: 'Time spent on database operations (ms)'
      },
      apiCallTime: {
        type: Number,
        default: 0,
        description: 'Time spent on API calls (ms)'
      },
      memoryUsed: {
        type: Number,
        default: 0,
        description: 'Memory used in MB'
      },
      cpuUsed: {
        type: Number,
        default: 0,
        description: 'CPU usage percentage'
      }
    },

    // Sync details
    syncDetails: {
      requestPayload: {
        type: mongoose.Schema.Types.Mixed,
        select: false,
        default: null
      },
      responsePayload: {
        type: mongoose.Schema.Types.Mixed,
        select: false,
        default: null
      },
      apiVersion: String,
      endpointUsed: String
    },

    // Data quality assessment
    dataQuality: {
      score: {
        type: Number,
        min: 0,
        max: 1,
        default: 1
      },
      issues: [String],
      missingFields: [String],
      incompleteRecords: {
        type: Number,
        default: 0
      },
      anomaliesDetected: [String]
    },

    // Reconciliation quality
    reconciliationQuality: {
      matchedPercentage: {
        type: Number,
        default: 0
      },
      averageConfidence: {
        type: Number,
        default: 0
      },
      unresolvedTransactions: {
        type: Number,
        default: 0
      },
      conflictsDetected: {
        type: Number,
        default: 0
      }
    },

    // Initiated by
    initiatedBy: {
      type: String,
      enum: ['scheduled', 'manual', 'webhook', 'api', 'system'],
      default: 'manual'
    },
    initiatedByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      description: 'If manual sync, who initiated it'
    },

    // Retry information
    isRetry: {
      type: Boolean,
      default: false
    },
    previousSyncLog: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SyncLog',
      default: null,
      description: 'Reference to previous failed sync if this is a retry'
    },

    // Next sync schedule
    nextSyncScheduled: Date,

    // Metadata
    tags: [String],
    notes: String,
    webhook: {
      url: String,
      retries: Number,
      lastAttempt: Date
    }
  },
  {
    timestamps: true,
    collection: 'sync_logs'
  }
);

// Indexes
syncLogSchema.index({ bankLink: 1, startedAt: -1 });
syncLogSchema.index({ user: 1, startedAt: -1 });
syncLogSchema.index({ status: 1 });
syncLogSchema.index({ startedAt: -1 });
syncLogSchema.index({ bankInstitution: 1, startedAt: -1 });
syncLogSchema.index({ initiatedBy: 1 });
syncLogSchema.index({ 'dateRangeProcessed.start': 1, 'dateRangeProcessed.end': 1 });

// Methods
syncLogSchema.methods.markInProgress = function() {
  this.status = 'in_progress';
  return this.save();
};

syncLogSchema.methods.markSuccess = function() {
  this.status = 'success';
  this.completedAt = new Date();
  this.duration = this.completedAt - this.startedAt;
  return this.save();
};

syncLogSchema.methods.markPartial = function(reason) {
  this.status = 'partial';
  this.statusReason = reason;
  this.completedAt = new Date();
  this.duration = this.completedAt - this.startedAt;
  return this.save();
};

syncLogSchema.methods.markFailed = function(error) {
  this.status = 'failed';
  this.statusReason = error;
  this.completedAt = new Date();
  this.duration = this.completedAt - this.startedAt;
  return this.save();
};

syncLogSchema.methods.addError = function(code, message, severity = 'error', details = null) {
  this.errors.push({
    timestamp: new Date(),
    code,
    message,
    severity,
    details
  });
  this.errorCount += 1;
  return this.save();
};

syncLogSchema.methods.addWarning = function(code, message, details = null) {
  this.errors.push({
    timestamp: new Date(),
    code,
    message,
    severity: 'warning',
    details
  });
  this.warningCount += 1;
  return this.save();
};

syncLogSchema.methods.getSuccessRate = function() {
  if (this.transactionsProcessed === 0) return 0;
  return (this.transactionsProcessed - this.transactionsFailed) / this.transactionsProcessed;
};

syncLogSchema.methods.getMatchRate = function() {
  if (this.transactionsImported === 0) return 0;
  return this.transactionsMatched / this.transactionsImported;
};

syncLogSchema.methods.getDurationSeconds = function() {
  if (!this.duration) return null;
  return this.duration / 1000;
};

syncLogSchema.methods.getTransactionsPerSecond = function() {
  if (!this.duration || this.duration === 0) return 0;
  return this.transactionsProcessed / (this.duration / 1000);
};

// Static methods
syncLogSchema.statics.getRecentSyncs = function(bankLinkId, limit = 10) {
  return this.find({ bankLink: bankLinkId }).sort({ startedAt: -1 }).limit(limit);
};

syncLogSchema.statics.getSuccessfulSyncs = function(bankLinkId) {
  return this.find({
    bankLink: bankLinkId,
    status: { $in: ['success', 'partial'] }
  }).sort({ startedAt: -1 });
};

syncLogSchema.statics.getFailedSyncs = function(bankLinkId) {
  return this.find({
    bankLink: bankLinkId,
    status: 'failed'
  }).sort({ startedAt: -1 });
};

syncLogSchema.statics.getLastSuccessfulSync = function(bankLinkId) {
  return this.findOne({
    bankLink: bankLinkId,
    status: { $in: ['success', 'partial'] }
  }).sort({ completedAt: -1 });
};

syncLogSchema.statics.getSyncStats = async function(bankLinkId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const logs = await this.find({
    bankLink: bankLinkId,
    startedAt: { $gte: startDate }
  });

  const stats = {
    totalSyncs: logs.length,
    successfulSyncs: logs.filter(l => l.status === 'success').length,
    partialSyncs: logs.filter(l => l.status === 'partial').length,
    failedSyncs: logs.filter(l => l.status === 'failed').length,
    totalTransactionsImported: logs.reduce((sum, l) => sum + l.transactionsImported, 0),
    totalTransactionsMatched: logs.reduce((sum, l) => sum + l.transactionsMatched, 0),
    averageSyncDuration: logs.reduce((sum, l) => sum + (l.duration || 0), 0) / logs.length,
    averageSuccessRate: logs.reduce((sum, l) => sum + l.getSuccessRate(), 0) / logs.length,
    lastSync: logs[0]?.completedAt || null
  };

  return stats;
};

syncLogSchema.statics.getUserSyncStats = async function(userId) {
  return this.aggregate([
    { $match: { user: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalTransactions: { $sum: '$transactionsImported' },
        averageDuration: { $avg: '$duration' }
      }
    }
  ]);
};

syncLogSchema.statics.cleanup = async function(retentionDays = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  return this.deleteMany({
    completedAt: { $lt: cutoffDate }
  });
};

module.exports = mongoose.model('SyncLog', syncLogSchema);
