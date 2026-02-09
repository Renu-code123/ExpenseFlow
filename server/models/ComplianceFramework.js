const mongoose = require('mongoose');

const complianceFrameworkSchema = new mongoose.Schema({
  standard: {
    type: String,
    required: true,
    enum: ['SOX', 'GDPR', 'PCI_DSS', 'HIPAA', 'SOC2', 'ISO27001', 'CCPA', 'PIPEDA'],
    unique: true
  },
  version: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  requirements: [{
    id: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: String,
    category: {
      type: String,
      enum: ['data_protection', 'access_control', 'audit_logging', 'financial_reporting', 'risk_management']
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    automatedCheck: {
      enabled: {
        type: Boolean,
        default: false
      },
      checkFunction: String,
      frequency: {
        type: String,
        enum: ['realtime', 'hourly', 'daily', 'weekly', 'monthly'],
        default: 'daily'
      }
    },
    controls: [{
      controlId: String,
      description: String,
      implementation: String,
      testProcedure: String
    }]
  }],
  applicableEntities: [{
    type: String,
    enum: ['expense', 'user', 'workspace', 'payment', 'report', 'system']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

complianceFrameworkSchema.index({ standard: 1 });
complianceFrameworkSchema.index({ isActive: 1 });

module.exports = mongoose.model('ComplianceFramework', complianceFrameworkSchema);