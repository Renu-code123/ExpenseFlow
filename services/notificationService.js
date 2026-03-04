const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');
const adapters = require('./notificationAdapters');
const templates = require('../templates/notificationTemplates');

/**
 * Programmable Notification Hub
 * Issue #646: Centralized logic for multi-channel message distribution
 */
class NotificationService {
  constructor() {
    this.io = null;
  }

  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Dispatch a notification to multiple channels based on user preferences
   * @param {string} userId - Target user ID
   * @param {string} templateKey - key from notificationTemplates.js
   * @param {Object} data - Context data for the template
   */
  async dispatch(userId, templateKey, data) {
    try {
      // 1. Render content
      const content = templates.render(templateKey, data);

      // 2. Fetch user preferences
      let preferences = await NotificationPreference.findOne({ userId });
      if (!preferences) {
        preferences = await NotificationPreference.create({ userId });
      }

      // 3. Persist notification in DB (In-App is always persisted)
      const notification = new Notification({
        userId,
        title: content.title,
        message: content.message,
        type: templateKey.split('_')[0],
        priority: content.priority,
        metadata: data
      });

      // 4. Distribute to channels
      const channelPromises = [];

      // In-App Channel
      if (preferences.channels.in_app) {
        notification.channels.push({ name: 'in_app' });
        channelPromises.push(
          adapters.InAppAdapter(this.io).send(userId, { ...content, id: notification._id })
            .then(res => this._updateChannelStatus(notification, 'in_app', res))
        );
      }

      // Email Channel
      if (preferences.channels.email) {
        notification.channels.push({ name: 'email' });
        // Assuming user object is pre-fetched or email is in data
        const userEmail = data.userEmail || await this._getUserEmail(userId);
        channelPromises.push(
          adapters.EmailAdapter.send(userEmail, content)
            .then(res => this._updateChannelStatus(notification, 'email', res))
        );
      }

      // Webhook Channel
      if (preferences.channels.webhook && preferences.webhookUrl) {
        notification.channels.push({ name: 'webhook' });
        channelPromises.push(
          adapters.WebhookAdapter.send(preferences.webhookUrl, content)
            .then(res => this._updateChannelStatus(notification, 'webhook', res))
        );
      }

      await Promise.all(channelPromises);
      await notification.save();

      return notification;
    } catch (error) {
      console.error('[NotificationService] Dispatch failed:', error);
      throw error;
    }
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId, userId) {
    return await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { status: 'read' },
      { new: true }
    );
  }

  /**
   * Mark all notifications for a user as read
   */
  async markAllRead(userId) {
    return await Notification.updateMany(
      { userId, status: 'unread' },
      { status: 'read' }
    );
  }

  /**
   * Get user notification history with pagination
   */
  async getHistory(userId, options = {}) {
    const { page = 1, limit = 20, status } = options;
    const query = { userId };
    if (status) query.status = status;

    return await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
  }

  _updateChannelStatus(notification, channelName, result) {
    const channel = notification.channels.find(c => c.name === channelName);
    if (channel) {
      channel.status = result.success ? 'sent' : 'failed';
      channel.deliveredAt = result.success ? new Date() : null;
      if (!result.success) channel.error = result.error;
    }
  }

  async _getUserEmail(userId) {
    // In real app, fetch from User model cache or DB
    const User = require('../models/User');
    const user = await User.findById(userId).select('email');
    return user ? user.email : null;
  }
}

module.exports = new NotificationService();
