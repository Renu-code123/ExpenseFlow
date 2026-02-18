const mongoose = require('mongoose');
const crypto = require('crypto');

const bankLinkSchema = new mongoose.Schema(
  {
    // User and institution
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    institution: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankInstitution',
      required: true,
      index: true
    },

    // Link identification
    linkId: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    displayName: {
      type: String,
      required: true,
      trim: true
    },
    description: String,

    // Authentication tokens (encrypted)
    accessToken: {
      type: String,
      required: true,
      select: false // Don't return by default
    },
    accessTokenEncrypted: {
      type: Boolean,
      default: true
    },
    refreshToken: {
      type: String,
      select: false,
      default: null
    },
    tokenEncryptionKey: {
      type: String,
      select: false,
      default: null
    },
    publicKey: {
      type: String,
      default: null
    },

    // Consent and expiry
    consentExpiry: {
      type: Date,
      required: true
    },
    consentExpiryWarned: {
      type: Boolean,
      default: false
    },
    lastConsentRenewal: Date,

    // Linked accounts
    accounts: {
      type: [
        {
          accountId: String,
          externalId: String, // Bank's account identifier
          name: String,
          displayName: String,
          type: {
            type: String,
            enum: ['checking', 'savings', 'credit', 'investment', 'loan', 'mortgage', 'other']
          },
          subtype: String,
          currency: String,
          balance: {
            current: Number,
            available: Number,
            limit: Number
          },
          balanceUpdatedAt: Date,
          accountNumber: {
            type: String,
            select: false
          },
          routingNumber: {
            type: String,
            select: false
          },
          mask: String, // Last 4 digits
          status: {
            type: String,
            enum: ['active', 'inactive', 'closed'],
            default: 'active'
          },
          openedAt: Date,
          closedAt: Date,
          syncEnabled: {
            type: Boolean,
            default: true
          },
          lastSync: Date,
          transactionCount: {
            type: Number,
            default: 0
          }
        }
      ],
      default: []
    },

    // Connection status
    status: {
      type: String,
      enum: ['active', 'requires_reauth', 'expired', 'error', 'revoked', 'pending', 'invalid'],
      default: 'active',
      index: true
    },
    statusReason: String,

    // Error tracking
    errorDetails: {
      code: String,
      message: String,
      timestamp: Date,
      retryCount: {
        type: Number,
        default: 0
      },
      lastRetryTime: Date
    },

    // Sync information
    lastSync: {
      type: Date,
      default: null
    },
    nextScheduledSync: {
      type: Date,
      default: null
    },
    lastSyncStatus: {
      type: String,
      enum: ['success', 'partial', 'failed', 'pending'],
      default: 'pending'
    },
    lastSyncError: String,
    syncHistory: [
      {
        timestamp: {
          type: Date,
          default: Date.now
        },
        status: {
          type: String,
          enum: ['success', 'partial', 'failed']
        },
        transactionsImported: Number,
        transactionsMatched: Number,
        duration: Number, // milliseconds
        error: String
      }
    ],
    consecutiveSyncFailures: {
      type: Number,
      default: 0
    },

    // User preferences
    autoSync: {
      type: Boolean,
      default: true
    },
    syncFrequency: {
      type: Number,
      default: 3600, // seconds (1 hour)
      min: 300, // 5 minutes
      max: 86400 // 24 hours
    },
    autoCreateExpenses: {
      type: Boolean,
      default: false
    },
    autoMatchThreshold: {
      type: Number,
      default: 0.85, // 85% match confidence
      min: 0,
      max: 1
    },

    // Permissions and scope
    scopes: [String],
    permissions: {
      read_accounts: {
        type: Boolean,
        default: true
      },
      read_transactions: {
        type: Boolean,
        default: true
      },
      read_balances: {
        type: Boolean,
        default: true
      },
      read_investments: {
        type: Boolean,
        default: false
      }
    },

    // Security
    linkedIp: String,
    linkedUserAgent: String,
    linkedAt: {
      type: Date,
      default: Date.now
    },
    lastAccessIp: String,
    lastAccessUserAgent: String,
    lastAccessedAt: Date,
    revocationRequested: {
      type: Boolean,
      default: false
    },
    revocationRequestedAt: Date,
    revocationReason: String,

    // Statistics
    stats: {
      totalTransactionsImported: {
        type: Number,
        default: 0
      },
      totalTransactionsMatched: {
        type: Number,
        default: 0
      },
      totalExpensesCreated: {
        type: Number,
        default: 0
      },
      successfulSyncs: {
        type: Number,
        default: 0
      },
      failedSyncs: {
        type: Number,
        default: 0
      },
      averageSyncDuration: {
        type: Number,
        default: 0 // milliseconds
      }
    },

    // Metadata
    tags: [String],
    notes: String,
    isArchived: {
      type: Boolean,
      default: false
    },
    archivedAt: Date
  },
  {
    timestamps: true,
    collection: 'bank_links'
  }
);

// Indexes
bankLinkSchema.index({ user: 1, status: 1 });
bankLinkSchema.index({ user: 1, institution: 1 });
bankLinkSchema.index({ linkId: 1 });
bankLinkSchema.index({ lastSync: -1 });
bankLinkSchema.index({ consentExpiry: 1 });
bankLinkSchema.index({ createdAt: -1 });

// Encryption helper methods
const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.BANK_LINK_ENCRYPTION_KEY || 'change-me-in-production-with-32-bytes';

function encryptToken(token) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decryptToken(encryptedToken) {
  const parts = encryptedToken.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Pre-save: encrypt tokens
bankLinkSchema.pre('save', function(next) {
  if (this.isModified('accessToken') && !this.accessToken.includes(':')) {
    this.accessToken = encryptToken(this.accessToken);
    this.accessTokenEncrypted = true;
  }
  if (this.isModified('refreshToken') && this.refreshToken && !this.refreshToken.includes(':')) {
    this.refreshToken = encryptToken(this.refreshToken);
  }
  next();
});

// Methods
bankLinkSchema.methods.getDecryptedAccessToken = function() {
  if (this.accessTokenEncrypted && this.accessToken.includes(':')) {
    return decryptToken(this.accessToken);
  }
  return this.accessToken;
};

bankLinkSchema.methods.getDecryptedRefreshToken = function() {
  if (this.refreshToken && this.refreshToken.includes(':')) {
    return decryptToken(this.refreshToken);
  }
  return this.refreshToken;
};

bankLinkSchema.methods.updateAccessToken = function(newToken, newRefreshToken = null) {
  this.accessToken = newToken;
  if (newRefreshToken) {
    this.refreshToken = newRefreshToken;
  }
  return this.save();
};

bankLinkSchema.methods.isExpired = function() {
  return new Date() > this.consentExpiry;
};

bankLinkSchema.methods.daysUntilExpiry = function() {
  const days = Math.ceil((this.consentExpiry - new Date()) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
};

bankLinkSchema.methods.requiresReauth = function() {
  return this.status === 'requires_reauth' || this.isExpired();
};

bankLinkSchema.methods.setError = function(code, message) {
  this.status = 'error';
  this.errorDetails = {
    code,
    message,
    timestamp: new Date(),
    retryCount: (this.errorDetails?.retryCount || 0) + 1,
    lastRetryTime: new Date()
  };
  return this.save();
};

bankLinkSchema.methods.clearError = function() {
  this.status = 'active';
  this.errorDetails = {
    code: null,
    message: null,
    timestamp: null,
    retryCount: 0
  };
  return this.save();
};

bankLinkSchema.methods.recordSyncResult = function(result) {
  this.lastSync = new Date();
  this.lastSyncStatus = result.status;
  
  if (result.status === 'success' || result.status === 'partial') {
    this.consecutiveSyncFailures = 0;
    this.status = 'active';
    this.stats.successfulSyncs += 1;
  } else {
    this.consecutiveSyncFailures += 1;
    this.stats.failedSyncs += 1;
    this.lastSyncError = result.error;
  }

  // Update statistics
  this.stats.totalTransactionsImported += result.transactionsImported || 0;
  this.stats.totalTransactionsMatched += result.transactionsMatched || 0;
  
  if (result.duration) {
    const avg = this.stats.averageSyncDuration;
    const total = this.stats.successfulSyncs + this.stats.failedSyncs;
    this.stats.averageSyncDuration = (avg * (total - 1) + result.duration) / total;
  }

  // Add to sync history
  this.syncHistory.push({
    timestamp: new Date(),
    status: result.status,
    transactionsImported: result.transactionsImported,
    transactionsMatched: result.transactionsMatched,
    duration: result.duration,
    error: result.error
  });

  // Keep only last 100 syncs
  if (this.syncHistory.length > 100) {
    this.syncHistory = this.syncHistory.slice(-100);
  }

  return this.save();
};

bankLinkSchema.methods.getActiveAccounts = function() {
  return this.accounts.filter(acc => acc.status === 'active' && acc.syncEnabled);
};

bankLinkSchema.methods.getAccountById = function(accountId) {
  return this.accounts.find(acc => acc.accountId === accountId);
};

bankLinkSchema.methods.updateAccountBalance = function(accountId, balanceData) {
  const account = this.getAccountById(accountId);
  if (account) {
    account.balance = balanceData;
    account.balanceUpdatedAt = new Date();
  }
  return this.save();
};

bankLinkSchema.methods.revoke = function(reason) {
  this.status = 'revoked';
  this.revocationRequested = true;
  this.revocationRequestedAt = new Date();
  this.revocationReason = reason;
  return this.save();
};

// Static methods
bankLinkSchema.statics.getUserLinks = function(userId) {
  return this.find({ user: userId, isArchived: false }).populate('institution');
};

bankLinkSchema.statics.getActiveLinks = function(userId) {
  return this.find({
    user: userId,
    status: 'active',
    isArchived: false
  }).populate('institution');
};

bankLinkSchema.statics.getLinksNeedingReauth = function() {
  return this.find({
    $or: [
      { status: 'requires_reauth' },
      { consentExpiry: { $lt: new Date() } }
    ],
    isArchived: false
  });
};

bankLinkSchema.statics.getLinksNeedingSync = function(minutes = 60) {
  const lastSyncBefore = new Date(Date.now() - minutes * 60 * 1000);
  return this.find({
    user: { $exists: true },
    status: 'active',
    autoSync: true,
    isArchived: false,
    $or: [
      { lastSync: null },
      { lastSync: { $lt: lastSyncBefore } }
    ]
  });
};

bankLinkSchema.statics.getExpiringConsents = function(daysWarning = 7) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + daysWarning);
  
  return this.find({
    consentExpiry: {
      $lt: expiryDate,
      $gt: new Date()
    },
    consentExpiryWarned: false,
    isArchived: false
  });
};

bankLinkSchema.statics.getUserLinksByInstitution = function(userId, institutionId) {
  return this.findOne({
    user: userId,
    institution: institutionId,
    isArchived: false
  });
};

module.exports = mongoose.model('BankLink', bankLinkSchema);
