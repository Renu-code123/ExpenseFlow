const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  type: {
    type: String,
    enum: ['budget_alert', 'goal_achieved', 'expense_added', 'security_alert', 'system', 'custom'],
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  channels: [{
    type: String,
    enum: ['in_app', 'email', 'push', 'sms', 'webhook']
  }],
  data: {
    type: mongoose.Schema.Types.Mixed
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  delivered: {
    in_app: { type: Boolean, default: false },
    email: { type: Boolean, default: false },
    push: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    webhook: { type: Boolean, default: false }
  },
  deliveredAt: {
    in_app: Date,
    email: Date,
    push: Date,
    sms: Date,
    webhook: Date
  },
  scheduledFor: Date,
  expiresAt: Date
}, {
  timestamps: true
});

// User notification preferences schema
const notificationPreferencesSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  channels: {
    email: {
      enabled: { type: Boolean, default: true },
      types: [{
        type: String,
        enum: ['budget_alert', 'goal_achieved', 'expense_added', 'security_alert', 'system']
      }]
    },
    push: {
      enabled: { type: Boolean, default: true },
      subscription: mongoose.Schema.Types.Mixed,
      types: [{
        type: String,
        enum: ['budget_alert', 'goal_achieved', 'expense_added', 'security_alert', 'system']
      }]
    },
    sms: {
      enabled: { type: Boolean, default: false },
      phoneNumber: String,
      types: [{
        type: String,
        enum: ['budget_alert', 'security_alert', 'system']
      }]
    },
    webhook: {
      enabled: { type: Boolean, default: false },
      url: String,
      secret: String,
      types: [{
        type: String,
        enum: ['budget_alert', 'goal_achieved', 'expense_added', 'security_alert', 'system']
      }]
    }
  },
  quietHours: {
    enabled: { type: Boolean, default: false },
    start: String, // HH:MM format
    end: String,   // HH:MM format
    timezone: { type: String, default: 'UTC' }
  },
  frequency: {
    budget_alerts: { type: String, enum: ['immediate', 'daily', 'weekly'], default: 'immediate' },
    goal_updates: { type: String, enum: ['immediate', 'daily', 'weekly'], default: 'daily' },
    expense_summaries: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' }
  }
}, {
  timestamps: true
});

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ scheduledFor: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Notification = mongoose.model('Notification', notificationSchema);
const NotificationPreferences = mongoose.model('NotificationPreferences', notificationPreferencesSchema);

module.exports = { Notification, NotificationPreferences };