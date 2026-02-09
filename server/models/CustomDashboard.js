const mongoose = require('mongoose');

const customDashboardSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace'
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  layout: {
    columns: { type: Number, default: 12 },
    rows: { type: Number, default: 6 }
  },
  widgets: [{
    id: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['chart', 'metric', 'table', 'gauge', 'heatmap', 'treemap', 'funnel'],
      required: true
    },
    title: {
      type: String,
      required: true
    },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
      width: { type: Number, required: true },
      height: { type: Number, required: true }
    },
    dataSource: {
      type: {
        type: String,
        enum: ['expenses', 'budgets', 'goals', 'warehouse', 'external'],
        required: true
      },
      query: mongoose.Schema.Types.Mixed,
      aggregation: mongoose.Schema.Types.Mixed,
      filters: mongoose.Schema.Types.Mixed
    },
    visualization: {
      chartType: {
        type: String,
        enum: ['line', 'bar', 'pie', 'doughnut', 'area', 'scatter', 'bubble']
      },
      xAxis: String,
      yAxis: String,
      groupBy: String,
      colorScheme: String,
      showLegend: { type: Boolean, default: true },
      showGrid: { type: Boolean, default: true }
    },
    refreshInterval: {
      type: Number,
      default: 300000 // 5 minutes
    },
    isVisible: {
      type: Boolean,
      default: true
    }
  }],
  filters: [{
    name: String,
    type: {
      type: String,
      enum: ['date_range', 'category', 'amount_range', 'user', 'workspace']
    },
    defaultValue: mongoose.Schema.Types.Mixed,
    options: [mongoose.Schema.Types.Mixed]
  }],
  sharing: {
    isPublic: { type: Boolean, default: false },
    sharedWith: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      permission: {
        type: String,
        enum: ['view', 'edit'],
        default: 'view'
      }
    }],
    publicUrl: String
  },
  schedule: {
    enabled: { type: Boolean, default: false },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly']
    },
    recipients: [String],
    format: {
      type: String,
      enum: ['pdf', 'png', 'email'],
      default: 'email'
    }
  },
  isTemplate: {
    type: Boolean,
    default: false
  },
  templateCategory: String,
  lastAccessed: Date
}, {
  timestamps: true
});

customDashboardSchema.index({ userId: 1, workspaceId: 1 });
customDashboardSchema.index({ isTemplate: 1, templateCategory: 1 });
customDashboardSchema.index({ 'sharing.isPublic': 1 });

module.exports = mongoose.model('CustomDashboard', customDashboardSchema);