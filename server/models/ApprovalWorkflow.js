const mongoose = require('mongoose');

const workflowStepSchema = new mongoose.Schema({
  order: {
    type: Number,
    required: true
  },
  approverRole: {
    type: String,
    enum: ['manager', 'director', 'finance', 'admin', 'specific_user'],
    required: true
  },
  specificUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  autoApproveUnder: {
    type: Number,
    default: 0
  },
  requireComments: {
    type: Boolean,
    default: true
  }
});

const approvalWorkflowSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  targetType: {
    type: String,
    enum: ['expense', 'budget', 'travel'],
    default: 'expense'
  },
  department: String,
  steps: [workflowStepSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ApprovalWorkflow', approvalWorkflowSchema);