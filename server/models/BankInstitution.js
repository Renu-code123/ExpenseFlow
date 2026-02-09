const mongoose = require('mongoose');

const bankInstitutionSchema = new mongoose.Schema(
  {
    // Institution identification
    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    logo: {
      type: String,
      default: null
    },
    website: {
      type: String,
      default: null
    },

    // Geographic and operational info
    country: {
      type: String,
      required: true,
      enum: [
        'US', 'IN', 'GB', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL',
        'SE', 'NO', 'DK', 'CH', 'IE', 'SG', 'HK', 'JP', 'KR', 'BR'
      ]
    },
    currency: {
      type: String,
      required: true,
      enum: ['USD', 'INR', 'GBP', 'CAD', 'AUD', 'EUR', 'SGD', 'HKD', 'JPY', 'KRW', 'BRL']
    },
    timezone: String,

    // API provider configuration
    apiProvider: {
      type: String,
      required: true,
      enum: ['plaid', 'yodlee', 'truelayer', 'open_banking', 'custom', 'mock'],
      index: true
    },
    apiConfig: {
      clientId: String,
      clientSecret: String,
      baseUrl: String,
      sandbox: {
        type: Boolean,
        default: true
      },
      apiKey: String,
      customHeaders: mongoose.Schema.Types.Mixed
    },

    // Feature matrix - what this bank supports
    supportedFeatures: {
      accounts: {
        type: Boolean,
        default: true
      },
      transactions: {
        type: Boolean,
        default: true
      },
      balances: {
        type: Boolean,
        default: true
      },
      investment_accounts: {
        type: Boolean,
        default: false
      },
      credit_cards: {
        type: Boolean,
        default: false
      },
      loans: {
        type: Boolean,
        default: false
      },
      recurring_transactions: {
        type: Boolean,
        default: false
      },
      transaction_enrichment: {
        type: Boolean,
        default: false
      },
      categorization: {
        type: Boolean,
        default: true
      },
      merchant_data: {
        type: Boolean,
        default: false
      }
    },

    // Account type support
    supportedAccountTypes: {
      type: [String],
      enum: ['checking', 'savings', 'credit', 'investment', 'loan', 'mortgage', 'other'],
      default: ['checking', 'savings']
    },

    // Connection & authentication
    authMethod: {
      type: String,
      enum: ['oauth2', 'api_key', 'username_password', 'custom'],
      default: 'oauth2'
    },
    oauthScopes: [String],
    consentDuration: {
      type: Number,
      default: 365, // days
      description: 'How long consent lasts before reauth needed'
    },
    rateLimit: {
      requests: {
        type: Number,
        default: 10000
      },
      window: {
        type: Number,
        default: 3600 // seconds
      }
    },

    // Status and health
    status: {
      type: String,
      enum: ['active', 'beta', 'deprecated', 'maintenance', 'offline'],
      default: 'active',
      index: true
    },
    isAvailable: {
      type: Boolean,
      default: true
    },
    maintenanceWindow: {
      start: Date,
      end: Date,
      reason: String
    },

    // Health monitoring
    lastHealthCheck: {
      type: Date,
      default: null
    },
    healthStatus: {
      type: String,
      enum: ['healthy', 'degraded', 'unhealthy', 'unknown'],
      default: 'unknown'
    },
    healthDetails: {
      message: String,
      checkedAt: Date,
      responseTime: Number // milliseconds
    },
    failureRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },
    lastFailureTime: Date,
    consecutiveFailures: {
      type: Number,
      default: 0
    },

    // Data retention & sync config
    transactionHistoryDepth: {
      type: Number,
      default: 90, // days
      description: 'How many days of transaction history available'
    },
    minSyncInterval: {
      type: Number,
      default: 300, // seconds
      description: 'Minimum time between syncs'
    },
    maxSyncBatchSize: {
      type: Number,
      default: 1000,
      description: 'Max transactions per sync request'
    },

    // Metadata & tracking
    description: String,
    notes: String,
    supportUrl: String,
    documentationUrl: String,

    // Statistics
    stats: {
      totalConnections: {
        type: Number,
        default: 0
      },
      activeConnections: {
        type: Number,
        default: 0
      },
      totalTransactionsSynced: {
        type: Number,
        default: 0
      },
      averageSyncTime: {
        type: Number,
        default: 0 // milliseconds
      },
      lastSyncTime: Date,
      successRate: {
        type: Number,
        default: 100
      }
    },

    // Tags and categories
    tags: [String],
    category: {
      type: String,
      enum: ['retail_bank', 'investment_bank', 'credit_union', 'fintech', 'neobank', 'other'],
      default: 'retail_bank'
    }
  },
  {
    timestamps: true,
    collection: 'bank_institutions'
  }
);

// Indexes
bankInstitutionSchema.index({ name: 1 });
bankInstitutionSchema.index({ code: 1 });
bankInstitutionSchema.index({ country: 1 });
bankInstitutionSchema.index({ apiProvider: 1 });
bankInstitutionSchema.index({ status: 1 });
bankInstitutionSchema.index({ 'supportedFeatures.transactions': 1 });
bankInstitutionSchema.index({ createdAt: -1 });

// Virtual for display name
bankInstitutionSchema.virtual('displayName').get(function() {
  return `${this.name} (${this.country})`;
});

// Methods
bankInstitutionSchema.methods.checkHealth = async function() {
  this.lastHealthCheck = new Date();
  return this.save();
};

bankInstitutionSchema.methods.updateStats = function(syncResult) {
  this.stats.totalTransactionsSynced += syncResult.transactionCount || 0;
  this.stats.lastSyncTime = new Date();
  
  if (syncResult.duration) {
    const avgTime = this.stats.averageSyncTime;
    const count = this.stats.totalConnections;
    this.stats.averageSyncTime = (avgTime * count + syncResult.duration) / (count + 1);
  }

  return this.save();
};

bankInstitutionSchema.methods.getFeatureList = function() {
  const features = [];
  Object.entries(this.supportedFeatures).forEach(([feature, supported]) => {
    if (supported) {
      features.push(feature);
    }
  });
  return features;
};

bankInstitutionSchema.methods.supportsFeature = function(feature) {
  return this.supportedFeatures[feature] === true;
};

bankInstitutionSchema.methods.isHealthy = function() {
  return this.healthStatus === 'healthy' && this.isAvailable;
};

bankInstitutionSchema.methods.canSync = function() {
  return this.status === 'active' && this.isHealthy();
};

// Static methods
bankInstitutionSchema.statics.getByCountry = function(country) {
  return this.find({ country, status: 'active' });
};

bankInstitutionSchema.statics.getByProvider = function(provider) {
  return this.find({ apiProvider: provider, status: 'active' });
};

bankInstitutionSchema.statics.getActive = function() {
  return this.find({ status: 'active', isAvailable: true });
};

bankInstitutionSchema.statics.getByCode = function(code) {
  return this.findOne({ code: code.toUpperCase() });
};

bankInstitutionSchema.statics.getSupportingFeature = function(feature) {
  return this.find({ 
    [`supportedFeatures.${feature}`]: true,
    status: 'active'
  });
};

bankInstitutionSchema.statics.getHealthyInstitutions = function() {
  return this.find({
    status: 'active',
    isAvailable: true,
    healthStatus: 'healthy'
  });
};

bankInstitutionSchema.statics.findByCountryAndFeature = function(country, feature) {
  return this.find({
    country,
    [`supportedFeatures.${feature}`]: true,
    status: 'active'
  });
};

bankInstitutionSchema.statics.updateHealthCheck = async function(institutionId, healthData) {
  return this.findByIdAndUpdate(
    institutionId,
    {
      lastHealthCheck: new Date(),
      'healthDetails.checkedAt': new Date(),
      'healthDetails.message': healthData.message,
      'healthDetails.responseTime': healthData.responseTime,
      healthStatus: healthData.status
    },
    { new: true }
  );
};

bankInstitutionSchema.statics.recordFailure = async function(institutionId) {
  const institution = await this.findById(institutionId);
  if (institution) {
    institution.consecutiveFailures += 1;
    institution.lastFailureTime = new Date();
    
    // Calculate failure rate
    const total = institution.stats.totalConnections;
    if (total > 0) {
      institution.failureRate = institution.consecutiveFailures / total;
    }
    
    // Mark as unhealthy if too many failures
    if (institution.consecutiveFailures >= 3) {
      institution.healthStatus = 'unhealthy';
    }
    
    return institution.save();
  }
};

bankInstitutionSchema.statics.recordSuccess = async function(institutionId) {
  return this.findByIdAndUpdate(
    institutionId,
    {
      $set: {
        consecutiveFailures: 0,
        healthStatus: 'healthy'
      }
    },
    { new: true }
  );
};

module.exports = mongoose.model('BankInstitution', bankInstitutionSchema);
