const mongoose = require('mongoose');

const reconciliationRuleSchema = new mongoose.Schema(
  {
    // User
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Rule identification
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: String,
    enabled: {
      type: Boolean,
      default: true,
      index: true
    },

    // Conditions - all must match for rule to apply
    conditions: {
      // Merchant matching
      merchantPattern: {
        type: String,
        default: null,
        description: 'Regex pattern for merchant name'
      },
      merchantPatternCaseSensitive: {
        type: Boolean,
        default: false
      },
      merchantWhitelist: [String],
      merchantBlacklist: [String],

      // Amount conditions
      amountRange: {
        min: {
          type: Number,
          default: 0
        },
        max: {
          type: Number,
          default: Number.MAX_VALUE
        }
      },
      amountExact: Number,
      amountTolerance: {
        type: Number,
        default: 0.01 // 1% tolerance
      },

      // Description matching
      descriptionContains: [String],
      descriptionExcludes: [String],
      descriptionPattern: String,

      // Date conditions
      dayOfWeek: {
        type: [Number],
        default: [], // 0-6, empty means all days
        min: 0,
        max: 6
      },
      dayOfMonth: {
        type: [Number],
        default: [], // 1-31, empty means all days
        min: 1,
        max: 31
      },
      monthsOfYear: {
        type: [Number],
        default: [], // 1-12, empty means all months
        min: 1,
        max: 12
      },

      // Transaction type
      transactionTypes: {
        type: [String],
        enum: [
          'debit', 'credit', 'transfer', 'withdrawal', 'deposit',
          'fee', 'interest', 'dividend', 'other'
        ],
        default: []
      },

      // Category (bank-provided)
      bankProvidedCategories: [String],
      paymentMethods: {
        type: [String],
        enum: ['card', 'transfer', 'check', 'cash', 'ach', 'wire', 'other'],
        default: []
      },

      // Country/location
      countries: [String],
      cities: [String],

      // MCC codes
      merchantCategoryCode: [String],

      // Amount direction
      direction: {
        type: String,
        enum: ['in', 'out', 'both'],
        default: 'both'
      }
    },

    // Actions to take when rule matches
    action: {
      type: {
        type: String,
        enum: ['auto_match', 'auto_create', 'ignore', 'flag', 'categorize', 'tag'],
        required: true
      },

      // Auto-match action
      matchCriteria: {
        minConfidence: {
          type: Number,
          default: 0.85,
          min: 0,
          max: 1
        },
        searchRadius: {
          type: Number,
          default: 2, // days
          description: 'Search within this many days of transaction'
        }
      },

      // Auto-create action
      createAsExpense: {
        type: Boolean,
        default: false
      },

      // Flag action
      flagType: {
        type: String,
        enum: ['review_needed', 'suspicious', 'duplicate', 'unusual', 'important', 'custom'],
        default: 'review_needed'
      },
      flagMessage: String
    },

    // Category and merchant overrides
    categoryOverride: {
      type: String,
      enum: [
        'food', 'transport', 'shopping', 'entertainment', 'utilities',
        'health', 'education', 'salary', 'transfer', 'subscription',
        'investment', 'loan', 'other'
      ],
      default: null
    },
    merchantOverride: String,
    tagOverride: [String],

    // Priority and execution
    priority: {
      type: Number,
      default: 100,
      index: true,
      description: 'Lower number = higher priority. Rules execute in priority order'
    },
    stopOnMatch: {
      type: Boolean,
      default: true,
      description: 'Stop executing further rules if this one matches'
    },

    // Frequency and scheduling
    applyToAllMatches: {
      type: Boolean,
      default: true,
      description: 'Apply to all matching transactions, not just new ones'
    },
    retroactiveApplication: {
      type: Boolean,
      default: false,
      description: 'Apply to existing transactions when rule is created'
    },
    retroactiveStartDate: Date,

    // Automation settings
    autoApply: {
      type: Boolean,
      default: true,
      description: 'Apply automatically or require user confirmation'
    },
    requiresApproval: {
      type: Boolean,
      default: false
    },
    approvalWorkflow: {
      type: String,
      enum: ['auto', 'manual', 'admin_approval'],
      default: 'auto'
    },

    // Linked entities
    relatedExpenseTemplate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExpenseTemplate',
      default: null
    },
    linkedBankLink: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankLink',
      default: null,
      description: 'If set, rule only applies to this bank link'
    },

    // Statistics
    stats: {
      totalMatches: {
        type: Number,
        default: 0
      },
      lastApplied: Date,
      applicationCount: {
        type: Number,
        default: 0
      },
      successCount: {
        type: Number,
        default: 0
      },
      failureCount: {
        type: Number,
        default: 0
      },
      averageProcessingTime: {
        type: Number,
        default: 0
      }
    },

    // Versioning and history
    version: {
      type: Number,
      default: 1
    },
    previousVersions: [
      {
        version: Number,
        conditions: mongoose.Schema.Types.Mixed,
        action: mongoose.Schema.Types.Mixed,
        createdAt: Date,
        reason: String
      }
    ],

    // Testing and validation
    testMode: {
      type: Boolean,
      default: false
    },
    testResults: {
      matchCount: Number,
      lastTestDate: Date,
      transactionsMatched: [
        {
          transactionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ImportedTransaction'
          },
          confidence: Number,
          timestamp: Date
        }
      ]
    },

    // Metadata
    tags: [String],
    notes: String,
    isArchived: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    collection: 'reconciliation_rules'
  }
);

// Indexes
reconciliationRuleSchema.index({ user: 1, enabled: 1, priority: 1 });
reconciliationRuleSchema.index({ user: 1, createdAt: -1 });
reconciliationRuleSchema.index({ linkedBankLink: 1 });
reconciliationRuleSchema.index({ priority: 1 });

// Methods
reconciliationRuleSchema.methods.matchesTransaction = function(transaction) {
  const cond = this.conditions;

  // Check merchant
  if (cond.merchantPattern) {
    const regex = new RegExp(cond.merchantPattern, cond.merchantPatternCaseSensitive ? '' : 'i');
    if (!regex.test(transaction.merchantName)) return false;
  }

  if (cond.merchantWhitelist.length > 0) {
    if (!cond.merchantWhitelist.includes(transaction.merchantName)) return false;
  }

  if (cond.merchantBlacklist.length > 0) {
    if (cond.merchantBlacklist.includes(transaction.merchantName)) return false;
  }

  // Check amount
  const amount = Math.abs(transaction.amount);
  if (amount < cond.amountRange.min || amount > cond.amountRange.max) {
    return false;
  }

  if (cond.amountExact && Math.abs(amount - cond.amountExact) > cond.amountExact * cond.amountTolerance) {
    return false;
  }

  // Check description
  if (cond.descriptionContains.length > 0) {
    const desc = transaction.description.toLowerCase();
    if (!cond.descriptionContains.some(word => desc.includes(word.toLowerCase()))) {
      return false;
    }
  }

  if (cond.descriptionExcludes.length > 0) {
    const desc = transaction.description.toLowerCase();
    if (cond.descriptionExcludes.some(word => desc.includes(word.toLowerCase()))) {
      return false;
    }
  }

  if (cond.descriptionPattern) {
    const regex = new RegExp(cond.descriptionPattern, 'i');
    if (!regex.test(transaction.description)) return false;
  }

  // Check day of week
  if (cond.dayOfWeek.length > 0) {
    const dayOfWeek = new Date(transaction.date).getDay();
    if (!cond.dayOfWeek.includes(dayOfWeek)) return false;
  }

  // Check transaction type
  if (cond.transactionTypes.length > 0) {
    if (!cond.transactionTypes.includes(transaction.type)) return false;
  }

  // Check direction
  if (cond.direction !== 'both') {
    if (cond.direction === 'in' && transaction.direction !== 'in') return false;
    if (cond.direction === 'out' && transaction.direction !== 'out') return false;
  }

  return true;
};

reconciliationRuleSchema.methods.getAction = function() {
  return this.action;
};

reconciliationRuleSchema.methods.recordMatch = function(transactionId, confidence) {
  this.stats.totalMatches += 1;
  this.stats.lastApplied = new Date();
  this.stats.applicationCount += 1;
  this.stats.successCount += 1;

  if (this.testMode && this.testResults) {
    this.testResults.transactionsMatched.push({
      transactionId,
      confidence,
      timestamp: new Date()
    });
  }

  return this.save();
};

reconciliationRuleSchema.methods.setTestMode = function(enabled) {
  this.testMode = enabled;
  if (enabled) {
    this.testResults = {
      lastTestDate: new Date(),
      transactionsMatched: []
    };
  }
  return this.save();
};

reconciliationRuleSchema.methods.archive = function() {
  this.isArchived = true;
  this.enabled = false;
  return this.save();
};

reconciliationRuleSchema.methods.activate = function() {
  this.isArchived = false;
  this.enabled = true;
  return this.save();
};

// Static methods
reconciliationRuleSchema.statics.getUserRules = function(userId) {
  return this.find({ user: userId, isArchived: false }).sort({ priority: 1 });
};

reconciliationRuleSchema.statics.getEnabledRules = function(userId) {
  return this.find({ user: userId, enabled: true, isArchived: false }).sort({ priority: 1 });
};

reconciliationRuleSchema.statics.getRulesForBankLink = function(userId, bankLinkId) {
  return this.find({
    user: userId,
    $or: [
      { linkedBankLink: null },
      { linkedBankLink: bankLinkId }
    ],
    enabled: true,
    isArchived: false
  }).sort({ priority: 1 });
};

reconciliationRuleSchema.statics.getMatchingRules = function(userId, transaction) {
  return this.getUserRules(userId).filter(rule => rule.matchesTransaction(transaction));
};

module.exports = mongoose.model('ReconciliationRule', reconciliationRuleSchema);
