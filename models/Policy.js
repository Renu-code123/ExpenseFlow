const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  
  // Policy identification
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  
  // Policy conditions
  conditions: {
    // Resource type: 'expense', 'budget', 'transfer', 'receipt'
    resourceType: {
      type: String,
      enum: ['expense', 'budget', 'transfer', 'receipt'],
      required: true
    },
    
    // Category filter (optional)
    categories: [{
      type: String
    }],
    
    // Amount thresholds
    minAmount: {
      type: Number,
      default: 0
    },
    maxAmount: {
      type: Number,
      default: Infinity
    },
    currency: {
      type: String,
      default: 'USD'
    },
    
    // Department/team filter
    departments: [{
      type: String
    }],
    
    // Requester role filter
    requesterRoles: [{
      type: String,
      enum: ['admin', 'manager', 'member', 'guest']
    }],
    
    // Time-based rules
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6
    }],
    monthlyBudgetLimit: {
      type: Number
    }
  },
  
  // Approval workflow
  approvalChain: [{
    stage: {
      type: Number,
      required: true
    },
    approverRole: {
      type: String,
      enum: ['admin', 'manager', 'senior-manager'],
      required: true
    },
    approversCount: {
      type: Number,
      default: 1,
      min: 1,
      max: 5
    },
    specificApprovers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    timeoutDays: {
      type: Number,
      default: 5
    },
    autoApproveIfExpired: {
      type: Boolean,
      default: false
    },
    notificationEmail: {
      type: Boolean,
      default: true
    }
  }],
  
  // Actions on violation
  actions: {
    // auto_flag, auto_reject, hold_funds, escalate
    onViolation: [{
      type: String,
      enum: ['auto_flag', 'auto_reject', 'hold_funds', 'escalate', 'notify_admin']
    }],
    
    // Escalation path
    escalateTo: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    
    // Auto-reject if no approver available
    autoRejectIfNoApprover: {
      type: Boolean,
      default: false
    },
    
    // Hold funds in pending balance
    holdFunds: {
      type: Boolean,
      default: true
    }
  },
  
  // Risk scoring
  riskScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },
  
  // Exceptions and whitelist
  exceptions: {
    whitelistUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    whitelistCategories: [{
      type: String
    }],
    exemptFromApproval: {
      type: Boolean,
      default: false
    }
  },
  
  // Analytics and audit
  statistics: {
    totalViolations: {
      type: Number,
      default: 0
    },
    approvedTransactions: {
      type: Number,
      default: 0
    },
    rejectedTransactions: {
      type: Number,
      default: 0
    },
    averageApprovalTime: {
      type: Number,
      default: 0
    },
    lastViolationDate: Date,
    violationTrend: [{
      date: Date,
      count: Number
    }]
  },
  
  // Status and control
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  priority: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  },
  
  // Audit trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedAt: Date,
  
  // Soft delete
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  collection: 'policies'
});

// Indexes for performance
policySchema.index({ workspaceId: 1, isActive: 1 });
policySchema.index({ workspaceId: 1, 'conditions.resourceType': 1 });
policySchema.index({ createdAt: -1 });

// Methods
policySchema.methods.matchesTransaction = function(transaction) {
  const { amount, category, resourceType, requesterRole, department } = transaction;
  const conditions = this.conditions;
  
  // Check resource type
  if (conditions.resourceType !== resourceType) return false;
  
  // Check amount range
  if (amount < conditions.minAmount || amount > conditions.maxAmount) return false;
  
  // Check categories
  if (conditions.categories.length > 0 && !conditions.categories.includes(category)) {
    return false;
  }
  
  // Check departments
  if (conditions.departments.length > 0 && !conditions.departments.includes(department)) {
    return false;
  }
  
  // Check requester role
  if (conditions.requesterRoles.length > 0 && !conditions.requesterRoles.includes(requesterRole)) {
    return false;
  }
  
  return true;
};

policySchema.methods.getApprovalChain = function() {
  return this.approvalChain.sort((a, b) => a.stage - b.stage);
};

policySchema.methods.updateStatistics = function(updateData) {
  Object.assign(this.statistics, updateData);
  this.updatedAt = Date.now();
  return this.save();
};

// Pre-save hooks
policySchema.pre('save', function(next) {
  // Sort approval chain by stage
  if (this.approvalChain) {
    this.approvalChain.sort((a, b) => a.stage - b.stage);
  }
  next();
});

module.exports = mongoose.model('Policy', policySchema);
