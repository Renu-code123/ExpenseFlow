const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Workspace Invite Model
 * Issue #420: Token-based email invite system
 */

const workspaceInviteSchema = new mongoose.Schema({
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  
  // Invite details
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['manager', 'editor', 'viewer'],
    default: 'viewer'
  },
  
  // Token for secure join link
  token: {
    type: String,
    unique: true,
    required: true
  },
  tokenHash: {
    type: String,
    required: true
  },
  
  // Invite metadata
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    maxlength: 500
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'expired', 'revoked'],
    default: 'pending'
  },
  
  // Timestamps
  expiresAt: {
    type: Date,
    required: true,
    default: function() {
      // Default 7 days expiry
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  },
  acceptedAt: Date,
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  revokedAt: Date,
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Tracking
  emailSentAt: Date,
  emailSentCount: { type: Number, default: 0 },
  lastViewedAt: Date,
  viewCount: { type: Number, default: 0 },
  
  // Security
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

// Indexes
workspaceInviteSchema.index({ workspace: 1, email: 1 });
workspaceInviteSchema.index({ token: 1 });
workspaceInviteSchema.index({ tokenHash: 1 });
workspaceInviteSchema.index({ status: 1 });
workspaceInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Generate secure invite token
workspaceInviteSchema.statics.generateToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
};

// Find invite by token
workspaceInviteSchema.statics.findByToken = async function(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return this.findOne({ 
    tokenHash,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  })
  .populate('workspace', 'name description avatar owner memberCount')
  .populate('invitedBy', 'name email avatar');
};

// Check if user already invited
workspaceInviteSchema.statics.isPendingInvite = async function(workspaceId, email) {
  const invite = await this.findOne({
    workspace: workspaceId,
    email: email.toLowerCase(),
    status: 'pending',
    expiresAt: { $gt: new Date() }
  });
  return !!invite;
};

// Get pending invites for workspace
workspaceInviteSchema.statics.getPendingInvites = function(workspaceId) {
  return this.find({
    workspace: workspaceId,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  })
  .populate('invitedBy', 'name email avatar')
  .sort({ createdAt: -1 });
};

// Get user's pending invites (by email)
workspaceInviteSchema.statics.getUserPendingInvites = function(email) {
  return this.find({
    email: email.toLowerCase(),
    status: 'pending',
    expiresAt: { $gt: new Date() }
  })
  .populate('workspace', 'name description avatar memberCount')
  .populate('invitedBy', 'name email avatar')
  .sort({ createdAt: -1 });
};

// Instance method: Accept invite
workspaceInviteSchema.methods.accept = async function(userId) {
  this.status = 'accepted';
  this.acceptedAt = new Date();
  this.acceptedBy = userId;
  return this.save();
};

// Instance method: Decline invite
workspaceInviteSchema.methods.decline = async function() {
  this.status = 'declined';
  return this.save();
};

// Instance method: Revoke invite
workspaceInviteSchema.methods.revoke = async function(revokedById) {
  this.status = 'revoked';
  this.revokedAt = new Date();
  this.revokedBy = revokedById;
  return this.save();
};

// Instance method: Track view
workspaceInviteSchema.methods.trackView = async function(ipAddress, userAgent) {
  this.viewCount = (this.viewCount || 0) + 1;
  this.lastViewedAt = new Date();
  if (ipAddress) this.ipAddress = ipAddress;
  if (userAgent) this.userAgent = userAgent;
  return this.save();
};

// Instance method: Check if expired
workspaceInviteSchema.methods.isExpired = function() {
  return this.expiresAt < new Date() || this.status === 'expired';
};

// Instance method: Check if valid
workspaceInviteSchema.methods.isValid = function() {
  return this.status === 'pending' && !this.isExpired();
};

// Pre-save: Update expired status
workspaceInviteSchema.pre('save', function(next) {
  if (this.status === 'pending' && this.expiresAt < new Date()) {
    this.status = 'expired';
  }
  next();
});

// Virtual for remaining time
workspaceInviteSchema.virtual('remainingTime').get(function() {
  if (this.status !== 'pending') return 0;
  const remaining = this.expiresAt - new Date();
  return Math.max(0, remaining);
});

// Virtual for formatted expiry
workspaceInviteSchema.virtual('expiresIn').get(function() {
  const ms = this.remainingTime;
  if (ms <= 0) return 'Expired';
  
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return 'Less than an hour';
});

module.exports = mongoose.model('WorkspaceInvite', workspaceInviteSchema);
