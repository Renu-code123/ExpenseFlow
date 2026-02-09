const mongoose = require('mongoose');
const crypto = require('crypto');

const bankConnectionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Provider information
  provider: {
    type: String,
    enum: ['plaid', 'yodlee', 'truelayer', 'manual'],
    required: true
  },
  
  // Encrypted access tokens
  accessToken: {
    type: String,
    required: true
  },
  
  itemId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Institution details
  institution: {
    id: String,
    name: String,
    logo: String,
    primaryColor: String,
    url: String,
    country: {
      type: String,
      default: 'US'
    }
  },
  
  // Connection status
  status: {
    type: String,
    enum: ['active', 'pending', 'error', 'disconnected', 'requires_reauth'],
    default: 'pending'
  },
  
  // Error tracking
  error: {
    code: String,
    message: String,
    displayMessage: String,
    occurredAt: Date
  },
  
  // Consent and permissions
  consent: {
    scopes: [String],
    expiresAt: Date,
    grantedAt: Date
  },
  
  // Sync configuration
  syncConfig: {
    frequency: {
      type: String,
      enum: ['realtime', 'daily', 'weekly', 'manual'],
      default: 'daily'
    },
    lastSyncAt: Date,
    nextSyncAt: Date,
    syncEnabled: {
      type: Boolean,
      default: true
    },
    transactionDaysToSync: {
      type: Number,
      default: 30
    }
  },
  
  // Webhook configuration
  webhook: {
    enabled: {
      type: Boolean,
      default: true
    },
    url: String,
    secret: String,
    lastReceivedAt: Date
  },
  
  // Health monitoring
  health: {
    consecutiveFailures: {
      type: Number,
      default: 0
    },
    lastHealthCheck: Date,
    isHealthy: {
      type: Boolean,
      default: true
    },
    healthScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    }
  },
  
  // Audit trail
  auditLog: [{
    action: {
      type: String,
      enum: ['created', 'updated', 'synced', 'error', 'reauth', 'disconnected', 'reconnected']
    },
    details: mongoose.Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
bankConnectionSchema.index({ user: 1, status: 1 });
bankConnectionSchema.index({ 'institution.id': 1 });
bankConnectionSchema.index({ 'syncConfig.nextSyncAt': 1, status: 1 });
bankConnectionSchema.index({ provider: 1, status: 1 });

// Encryption key from environment
const ENCRYPTION_KEY = process.env.BANK_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex').slice(0, 32);
const IV_LENGTH = 16;

// Encrypt access token before saving
bankConnectionSchema.pre('save', function(next) {
  if (this.isModified('accessToken') && !this.accessToken.includes(':')) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(this.accessToken, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    this.accessToken = iv.toString('hex') + ':' + encrypted;
  }
  next();
});

// Decrypt access token method
bankConnectionSchema.methods.getDecryptedToken = function() {
  try {
    const parts = this.accessToken.split(':');
    if (parts.length !== 2) return this.accessToken;
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Token decryption error:', error);
    return null;
  }
};

// Add audit log entry
bankConnectionSchema.methods.addAuditEntry = function(action, details, ipAddress, userAgent) {
  this.auditLog.push({
    action,
    details,
    ipAddress,
    userAgent,
    timestamp: new Date()
  });
  
  // Keep only last 100 entries
  if (this.auditLog.length > 100) {
    this.auditLog = this.auditLog.slice(-100);
  }
};

// Update connection health
bankConnectionSchema.methods.updateHealth = function(success) {
  if (success) {
    this.health.consecutiveFailures = 0;
    this.health.isHealthy = true;
    this.health.healthScore = Math.min(100, this.health.healthScore + 10);
  } else {
    this.health.consecutiveFailures += 1;
    this.health.healthScore = Math.max(0, this.health.healthScore - 20);
    
    if (this.health.consecutiveFailures >= 3) {
      this.health.isHealthy = false;
      this.status = 'error';
    }
  }
  this.health.lastHealthCheck = new Date();
};

// Check if reauth is needed
bankConnectionSchema.methods.needsReauth = function() {
  return this.status === 'requires_reauth' || 
         this.status === 'error' ||
         (this.consent.expiresAt && new Date(this.consent.expiresAt) < new Date());
};

// Calculate next sync time
bankConnectionSchema.methods.calculateNextSync = function() {
  const now = new Date();
  switch (this.syncConfig.frequency) {
    case 'realtime':
      return new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes
    case 'daily':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
};

// Static: Find connections needing sync
bankConnectionSchema.statics.findDueForSync = function() {
  return this.find({
    status: 'active',
    'syncConfig.syncEnabled': true,
    'syncConfig.nextSyncAt': { $lte: new Date() }
  });
};

// Static: Find unhealthy connections
bankConnectionSchema.statics.findUnhealthy = function() {
  return this.find({
    'health.isHealthy': false
  }).populate('user', 'email name');
};

// Static: Get connection stats for user
bankConnectionSchema.statics.getUserStats = async function(userId) {
  const connections = await this.find({ user: userId });
  
  return {
    total: connections.length,
    active: connections.filter(c => c.status === 'active').length,
    needsAttention: connections.filter(c => c.needsReauth()).length,
    providers: [...new Set(connections.map(c => c.provider))],
    institutions: connections.map(c => ({
      id: c.institution.id,
      name: c.institution.name,
      status: c.status
    }))
  };
};

module.exports = mongoose.model('BankConnection', bankConnectionSchema);
