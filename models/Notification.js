const mongoose = require('mongoose');

/**
 * Notification Model
 * Issue #646: Centralized persistence for all alert history
 */
const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['info', 'warning', 'error', 'success', 'budget_alert', 'subscription_reminder', 'system'],
    default: 'info'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['unread', 'read', 'archived'],
    default: 'unread',
    index: true
  },
  channels: [{
    name: { type: String, enum: ['in_app', 'email', 'webhook', 'push'] },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    deliveredAt: Date,
    error: String
  }],
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  link: String,
  expiresAt: Date
}, {
  timestamps: true
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ status: 1 });

module.exports = mongoose.model('Notification', notificationSchema);