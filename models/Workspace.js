const mongoose = require('mongoose');

/**
 * Enterprise-Grade RBAC Workspace Model
 * Issue #420: Role-Based Access Control & Workspace Invites
 * 
 * Roles hierarchy:
 * - owner: Full control (transfer ownership, delete workspace)
 * - manager: Can add/edit members, manage settings
 * - editor: Can add/edit expenses, budgets
 * - viewer: Read-only access to reports
 */

// Permission definitions for each role
const ROLE_PERMISSIONS = {
  owner: [
    'workspace:delete',
    'workspace:transfer',
    'workspace:settings',
    'members:invite',
    'members:remove',
    'members:promote',
    'members:demote',
    'expenses:create',
    'expenses:edit',
    'expenses:delete',
    'expenses:approve',
    'budgets:manage',
    'reports:view',
    'reports:export',
    'audit:view'
  ],
  manager: [
    'workspace:settings',
    'members:invite',
    'members:remove',
    'members:promote',
    'members:demote',
    'expenses:create',
    'expenses:edit',
    'expenses:delete',
    'expenses:approve',
    'budgets:manage',
    'reports:view',
    'reports:export',
    'audit:view'
  ],
  editor: [
    'expenses:create',
    'expenses:edit',
    'expenses:delete',
    'budgets:view',
    'reports:view',
    'reports:export'
  ],
  viewer: [
    'expenses:view',
    'budgets:view',
    'reports:view'
  ]
};

// Role hierarchy for permission checks
const ROLE_HIERARCHY = {
  owner: 4,
  manager: 3,
  editor: 2,
  viewer: 1
};

const memberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
  permissions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Permission'
  }],
  customPermissions: [String], // Additional permissions beyond role
  restrictedPermissions: [String], // Permissions removed from role
  joinedAt: { type: Date, default: Date.now },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  inviteAcceptedAt: Date,
  lastActiveAt: Date,
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending'],
    default: 'active'
  }
}, { _id: true });

// Calculate effective permissions
memberSchema.virtual('effectivePermissions').get(function () {
  const basePermissions = ROLE_PERMISSIONS[this.role] || [];
  const custom = this.customPermissions || [];
  const restricted = this.restrictedPermissions || [];

  return [...new Set([...basePermissions, ...custom])]
    .filter(p => !restricted.includes(p));
});

const activityLogSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: [
      'workspace:created',
      'workspace:updated',
      'workspace:settings_changed',
      'member:invited',
      'member:joined',
      'member:removed',
      'member:role_changed',
      'member:permissions_changed',
      'invite:created',
      'invite:revoked',
      'invite:expired',
      'expense:created',
      'expense:approved',
      'expense:rejected'
    ],
    required: true
  },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  details: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String,
  timestamp: { type: Date, default: Date.now }
});

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Hierarchy fields (#629)
  parentWorkspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    default: null
  },
  type: {
    type: String,
    enum: ['company', 'department', 'team', 'project', 'sandbox'],
    default: 'company'
  },

  // Entity metadata for high-complexity organizational mapping
  entityMetadata: {
    legalName: String,
    taxId: String,
    registrationDate: Date,
    hqAddress: String,
    consolidatedBaseCurrency: { type: String, default: 'USD' }
  },

  inheritanceSettings: {
    inheritMembers: { type: Boolean, default: true },
    inheritRules: { type: Boolean, default: true },
    inheritCategories: { type: Boolean, default: true },
    allowOverrides: { type: Boolean, default: true }
  },

  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
    joinedAt: { type: Date, default: Date.now }
  }],
  inviteTokens: [{
    token: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 days
    used: { type: Boolean, default: false }
  }],
  settings: {
    currency: { type: String, default: 'USD' },
    timezone: { type: String, default: 'UTC' },
    approvalRequired: { type: Boolean, default: false },
    approvalThreshold: { type: Number, default: 1000 },
    expenseCategories: [String],
    budgetAlerts: { type: Boolean, default: true },
    weeklyReports: { type: Boolean, default: false },
    allowSelfApproval: { type: Boolean, default: false },
    requireReceipts: { type: Boolean, default: false },
    receiptThreshold: { type: Number, default: 25 }
  },

  // Invite settings
  inviteSettings: {
    allowManagerInvites: { type: Boolean, default: true },
    defaultRole: { type: String, enum: ['editor', 'viewer'], default: 'viewer' },
    inviteLinkEnabled: { type: Boolean, default: false },
    inviteLinkRole: { type: String, enum: ['editor', 'viewer'], default: 'viewer' },
    inviteLinkToken: String,
    inviteLinkExpiry: Date,
    maxMembers: { type: Number, default: 50 },
    domainRestriction: String // e.g., "@company.com"
  },

  // Activity log
  activityLog: [activityLogSchema],

  // Workspace status
  status: {
    type: String,
    enum: ['active', 'archived', 'suspended'],
    default: 'active'
  },

  // Usage stats
  stats: {
    totalExpenses: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    lastActivityAt: Date
  },

  // Real-time collaboration features (#471)
  activeUsers: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    socketId: String,
    status: {
      type: String,
      enum: ['online', 'busy', 'viewing', 'away'],
      default: 'online'
    },
    currentView: String, // Current page/expense they're viewing
    lastSeen: { type: Date, default: Date.now },
    device: {
      type: String,
      platform: String,
      browser: String
    }
  }],

  // Distributed locks for conflict prevention
  locks: [{
    resourceType: {
      type: String,
      enum: ['expense', 'budget', 'workspace'],
      required: true
    },
    resourceId: { type: String, required: true },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lockedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    socketId: String
  }],

  // Discussion threads
  discussions: [{
    parentType: { type: String, enum: ['workspace', 'expense'], required: true },
    parentId: { type: String }, // Optional, null for workspace-level discussions
    title: String,
    messages: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      text: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      edited: Boolean,
      editedAt: Date,
      reactions: [{
        emoji: String,
        users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
      }],
      mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    }],
    status: { type: String, enum: ['open', 'resolved', 'archived'], default: 'open' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
    createdAt: { type: Date, default: Date.now },
    lastMessageAt: { type: Date, default: Date.now }
  }],

  // Typing indicators
  typingUsers: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resourceType: String, // 'expense', 'discussion'
    resourceId: String,
    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
  }],

  // Collaboration settings
  collaborationSettings: {
    enableRealTimeSync: { type: Boolean, default: true },
    lockTimeout: { type: Number, default: 300 }, // seconds
    typingIndicatorTimeout: { type: Number, default: 10 }, // seconds
    presenceUpdateInterval: { type: Number, default: 30 }, // seconds
    maxConcurrentEditors: { type: Number, default: 10 },
    enableDiscussions: { type: Boolean, default: true },
    notifyOnMention: { type: Boolean, default: true },
    notifyOnLock: { type: Boolean, default: true }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
workspaceSchema.index({ owner: 1 });
workspaceSchema.index({ 'members.user': 1 });
workspaceSchema.index({ slug: 1 });
workspaceSchema.index({ status: 1 });
workspaceSchema.index({ 'inviteSettings.inviteLinkToken': 1 });

// Virtual for member count
workspaceSchema.virtual('memberCount').get(function () {
  return this.members.length;
});

// Generate slug from name
workspaceSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
      '-' + Date.now().toString(36);
  }
  next();
});

// Instance method: Check if user has permission
workspaceSchema.methods.hasPermission = function (userId, permission) {
  const member = this.members.find(m => m.user.toString() === userId.toString());
  if (!member) return false;
  if (member.status !== 'active') return false;

  // Owner has all permissions
  if (this.owner.toString() === userId.toString()) return true;

  const effectivePerms = member.effectivePermissions ||
    ROLE_PERMISSIONS[member.role] || [];
  return effectivePerms.includes(permission);
};

// Instance method: Get member by user ID
workspaceSchema.methods.getMember = function (userId) {
  return this.members.find(m => m.user.toString() === userId.toString());
};

// Instance method: Get user's role
workspaceSchema.methods.getUserRole = function (userId) {
  if (this.owner.toString() === userId.toString()) return 'owner';
  const member = this.getMember(userId);
  return member ? member.role : null;
};

// Instance method: Check if user can manage target role
workspaceSchema.methods.canManageRole = function (userId, targetRole) {
  const userRole = this.getUserRole(userId);
  if (!userRole) return false;

  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const targetLevel = ROLE_HIERARCHY[targetRole] || 0;

  // Can only manage roles below your level
  return userLevel > targetLevel;
};

// Instance method: Add activity log
workspaceSchema.methods.logActivity = function (action, performedBy, details = {}) {
  this.activityLog.push({
    action,
    performedBy,
    ...details,
    timestamp: new Date()
  });

  // Keep only last 1000 entries
  if (this.activityLog.length > 1000) {
    this.activityLog = this.activityLog.slice(-1000);
  }

  this.stats.lastActivityAt = new Date();
};

// Static method: Get user's workspaces
workspaceSchema.statics.getUserWorkspaces = function (userId) {
  return this.find({
    $or: [
      { owner: userId },
      { 'members.user': userId, 'members.status': 'active' }
    ],
    status: 'active'
  })
    .populate('owner', 'name email avatar')
    .populate('members.user', 'name email avatar')
    .sort({ updatedAt: -1 });
};

// Static method: Check permission (for middleware)
workspaceSchema.statics.checkPermission = async function (workspaceId, userId, permission) {
  const workspace = await this.findById(workspaceId);
  if (!workspace) return { allowed: false, reason: 'Workspace not found' };
  if (workspace.status !== 'active') return { allowed: false, reason: 'Workspace is not active' };

  const allowed = workspace.hasPermission(userId, permission);
  return {
    allowed,
    reason: allowed ? null : 'Permission denied',
    workspace,
    role: workspace.getUserRole(userId)
  };
};

// Instance method: Add user to active users (#471)
workspaceSchema.methods.addActiveUser = function (userId, socketId, device = {}) {
  // Remove existing entry for this user
  this.activeUsers = this.activeUsers.filter(
    u => u.user.toString() !== userId.toString()
  );

  this.activeUsers.push({
    user: userId,
    socketId,
    status: 'online',
    lastSeen: new Date(),
    device
  });

  return this.save();
};

// Instance method: Remove user from active users
workspaceSchema.methods.removeActiveUser = function (userId) {
  this.activeUsers = this.activeUsers.filter(
    u => u.user.toString() !== userId.toString()
  );
  return this.save();
};

// Instance method: Update user status
workspaceSchema.methods.updateUserStatus = function (userId, status, currentView = null) {
  const activeUser = this.activeUsers.find(
    u => u.user.toString() === userId.toString()
  );

  if (activeUser) {
    activeUser.status = status;
    activeUser.lastSeen = new Date();
    if (currentView !== null) {
      activeUser.currentView = currentView;
    }
  }

  return this.save();
};

// Instance method: Acquire lock
workspaceSchema.methods.acquireLock = async function (resourceType, resourceId, userId, socketId, lockDuration = 300) {
  // Check if already locked by another user
  const existingLock = this.locks.find(
    lock => lock.resourceType === resourceType &&
      lock.resourceId === resourceId &&
      lock.expiresAt > new Date()
  );

  if (existingLock && existingLock.lockedBy.toString() !== userId.toString()) {
    return {
      success: false,
      lockedBy: existingLock.lockedBy,
      expiresAt: existingLock.expiresAt
    };
  }

  // Remove expired or existing locks for this resource
  this.locks = this.locks.filter(
    lock => !(lock.resourceType === resourceType && lock.resourceId === resourceId) &&
      lock.expiresAt > new Date()
  );

  // Add new lock
  const expiresAt = new Date(Date.now() + lockDuration * 1000);
  this.locks.push({
    resourceType,
    resourceId,
    lockedBy: userId,
    lockedAt: new Date(),
    expiresAt,
    socketId
  });

  await this.save();
  return { success: true, expiresAt };
};

// Instance method: Release lock
workspaceSchema.methods.releaseLock = async function (resourceType, resourceId, userId) {
  this.locks = this.locks.filter(
    lock => !(lock.resourceType === resourceType &&
      lock.resourceId === resourceId &&
      lock.lockedBy.toString() === userId.toString())
  );

  return await this.save();
};

// Instance method: Check if resource is locked
workspaceSchema.methods.isLocked = function (resourceType, resourceId, userId = null) {
  const lock = this.locks.find(
    lock => lock.resourceType === resourceType &&
      lock.resourceId === resourceId &&
      lock.expiresAt > new Date()
  );

  if (!lock) return { locked: false };

  // If userId provided, check if it's locked by someone else
  if (userId && lock.lockedBy.toString() === userId.toString()) {
    return { locked: false, ownLock: true };
  }

  return {
    locked: true,
    lockedBy: lock.lockedBy,
    expiresAt: lock.expiresAt
  };
};

// Instance method: Clean expired locks
workspaceSchema.methods.cleanExpiredLocks = function () {
  const before = this.locks.length;
  this.locks = this.locks.filter(lock => lock.expiresAt > new Date());
  return before - this.locks.length; // Return number of locks removed
};

// Instance method: Add typing indicator
workspaceSchema.methods.setTyping = function (userId, resourceType, resourceId, duration = 10) {
  // Remove existing typing indicator for this user/resource
  this.typingUsers = this.typingUsers.filter(
    t => !(t.user.toString() === userId.toString() &&
      t.resourceType === resourceType &&
      t.resourceId === resourceId)
  );

  const expiresAt = new Date(Date.now() + duration * 1000);
  this.typingUsers.push({
    user: userId,
    resourceType,
    resourceId,
    startedAt: new Date(),
    expiresAt
  });

  return this.save();
};

// Instance method: Remove typing indicator
workspaceSchema.methods.clearTyping = function (userId, resourceType, resourceId) {
  this.typingUsers = this.typingUsers.filter(
    t => !(t.user.toString() === userId.toString() &&
      t.resourceType === resourceType &&
      t.resourceId === resourceId)
  );

  return this.save();
};

// Instance method: Get active typing users for resource
workspaceSchema.methods.getTypingUsers = function (resourceType, resourceId) {
  // Clean expired indicators
  this.typingUsers = this.typingUsers.filter(t => t.expiresAt > new Date());

  return this.typingUsers.filter(
    t => t.resourceType === resourceType && t.resourceId === resourceId
  );
};

// Instance method: Create discussion
workspaceSchema.methods.createDiscussion = function (parentType, parentId, title, userId, initialMessage) {
  const discussion = {
    parentType,
    parentId,
    title,
    messages: [],
    status: 'open',
    createdAt: new Date(),
    lastMessageAt: new Date()
  };

  if (initialMessage) {
    discussion.messages.push({
      user: userId,
      text: initialMessage,
      timestamp: new Date()
    });
  }

  this.discussions.push(discussion);
  return this.save();
};

// Instance method: Add message to discussion
workspaceSchema.methods.addMessage = function (discussionId, userId, text, mentions = []) {
  const discussion = this.discussions.id(discussionId);
  if (!discussion) return null;

  discussion.messages.push({
    user: userId,
    text,
    timestamp: new Date(),
    mentions
  });

  discussion.lastMessageAt = new Date();
  return this.save();
};

// Export role definitions for use in middleware
workspaceSchema.statics.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
workspaceSchema.statics.ROLE_HIERARCHY = ROLE_HIERARCHY;

const auditPlugin = require('../plugins/mongooseAuditV2');

// Register Audit Plugin
workspaceSchema.plugin(auditPlugin, { modelName: 'Workspace' });

module.exports = mongoose.model('Workspace', workspaceSchema);