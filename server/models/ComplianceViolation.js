const mongoose = require('mongoose');

const complianceViolationSchema = new mongoose.Schema({
  violationId: {
    type: String,
    required: true,
    unique: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace'
  },
  standard: {
    type: String,
    required: true,
    enum: ['SOX', 'GDPR', 'PCI_DSS', 'HIPAA', 'SOC2', 'ISO27001', 'CCPA', 'PIPEDA']
  },
  requirementId: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'investigating', 'remediation_in_progress', 'resolved', 'false_positive', 'accepted_risk'],
    default: 'open'
  },
  description: {
    type: String,
    required: true
  },
  affectedEntities: [{
    entityType: String,
    entityId: mongoose.Schema.Types.ObjectId,
    entityDescription: String
  }],
  detectedBy: {
    method: {
      type: String,
      enum: ['automated_scan', 'manual_review', 'external_audit', 'user_report'],
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    systemComponent: String
  },
  riskAssessment: {
    likelihood: {
      type: String,
      enum: ['very_low', 'low', 'medium', 'high', 'very_high']
    },
    impact: {
      type: String,
      enum: ['negligible', 'minor', 'moderate', 'major', 'catastrophic']
    },
    overallRisk: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    }
  },
  remediation: {
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dueDate: Date,
    actions: [{
      action: String,
      assignee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'blocked'],
        default: 'pending'
      },
      completedAt: Date,
      notes: String
    }],
    evidence: [{
      type: String,
      description: String,
      filePath: String,
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  notifications: [{
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    method: {
      type: String,
      enum: ['email', 'sms', 'in_app', 'webhook']
    },
    sentAt: Date,
    acknowledged: {
      type: Boolean,
      default: false
    },
    acknowledgedAt: Date
  }],
  auditTrail: [{
    action: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: mongoose.Schema.Types.Mixed
  }],
  resolvedAt: Date,
  resolutionNotes: String
}, {
  timestamps: true
});

complianceViolationSchema.index({ violationId: 1 });
complianceViolationSchema.index({ workspaceId: 1, status: 1 });
complianceViolationSchema.index({ standard: 1, severity: 1 });
complianceViolationSchema.index({ status: 1, createdAt: -1 });
complianceViolationSchema.index({ 'remediation.dueDate': 1, status: 1 });

module.exports = mongoose.model('ComplianceViolation', complianceViolationSchema);