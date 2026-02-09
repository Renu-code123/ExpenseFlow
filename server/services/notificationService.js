const webpush = require('web-push');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { Notification, NotificationPreferences } = require('../models/Notification');

let ioInstance = null;
let twilioClient = null;

// Configure web push only if VAPID keys are provided
if (process.env.VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.VAPID_SUBJECT &&
  process.env.VAPID_PUBLIC_KEY.length > 10) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    console.log('[NotificationService] Web push configured successfully');
  } catch (error) {
    console.warn('[NotificationService] Web push configuration failed:', error.message);
  }
}

// Configure Twilio if credentials provided
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('[NotificationService] Twilio configured successfully');
  } catch (error) {
    console.warn('[NotificationService] Twilio configuration failed:', error.message);
  }
}

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.initEmailTransporter();

    // Event type configurations
    this.eventTypes = {
      budget_alert: {
        name: 'Budget Alert',
        description: 'When spending exceeds budget threshold',
        defaultChannels: ['in_app', 'email', 'push'],
        priority: 'high',
        icon: '💰'
      },
      budget_breach: {
        name: 'Budget Breach',
        description: 'When budget limit is exceeded',
        defaultChannels: ['in_app', 'email', 'push'],
        priority: 'critical',
        icon: '🚨'
      },
      goal_achieved: {
        name: 'Goal Achieved',
        description: 'When a savings goal is reached',
        defaultChannels: ['in_app', 'email', 'push'],
        priority: 'medium',
        icon: '🎉'
      },
      goal_progress: {
        name: 'Goal Progress',
        description: 'Weekly progress updates on goals',
        defaultChannels: ['in_app', 'email'],
        priority: 'low',
        icon: '📈'
      },
      expense_added: {
        name: 'Expense Added',
        description: 'When a new expense is recorded',
        defaultChannels: ['in_app'],
        priority: 'low',
        icon: '💳'
      },
      recurring_reminder: {
        name: 'Recurring Bill Reminder',
        description: 'Upcoming recurring expense reminder',
        defaultChannels: ['in_app', 'email', 'push'],
        priority: 'medium',
        icon: '🔔'
      },
      recurring_processed: {
        name: 'Recurring Expense Processed',
        description: 'When a recurring expense is auto-processed',
        defaultChannels: ['in_app'],
        priority: 'low',
        icon: '🔄'
      },
      security_alert: {
        name: 'Security Alert',
        description: 'Security-related notifications',
        defaultChannels: ['in_app', 'email', 'push', 'sms'],
        priority: 'critical',
        icon: '🔐'
      },
      payment_received: {
        name: 'Payment Received',
        description: 'When split payment is received',
        defaultChannels: ['in_app', 'email'],
        priority: 'medium',
        icon: '✅'
      },
      payment_reminder: {
        name: 'Payment Reminder',
        description: 'Reminder to pay split expenses',
        defaultChannels: ['in_app', 'email', 'push'],
        priority: 'medium',
        icon: '⏰'
      },
      report_ready: {
        name: 'Report Ready',
        description: 'When a financial report is generated',
        defaultChannels: ['in_app', 'email'],
        priority: 'low',
        icon: '📊'
      },
      system: {
        name: 'System Notification',
        description: 'System updates and announcements',
        defaultChannels: ['in_app'],
        priority: 'low',
        icon: 'ℹ️'
      },
      insight_generated: {
        name: 'Financial Insight',
        description: 'AI-generated financial insights',
        defaultChannels: ['in_app', 'email'],
        priority: 'medium',
        icon: '💡'
      },
      anomaly_detected: {
        name: 'Anomaly Detected',
        description: 'Unusual spending pattern detected',
        defaultChannels: ['in_app', 'email', 'push'],
        priority: 'high',
        icon: '⚠️'
      },
      approval_required: {
        name: 'Approval Required',
        description: 'When an expense requires your approval',
        defaultChannels: ['in_app', 'email', 'push'],
        priority: 'high',
        icon: '✍️'
      },
      approval_decision: {
        name: 'Approval Decision',
        description: 'When your expense has been approved or rejected',
        defaultChannels: ['in_app', 'email', 'push'],
        priority: 'medium',
        icon: '⚖️'
      }
    };
  }

  // Initialize email transporter
  initEmailTransporter() {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        this.emailTransporter = nodemailer.createTransporter({
          service: process.env.EMAIL_SERVICE || 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
        console.log('[NotificationService] Email transporter configured');
      } catch (error) {
        console.warn('[NotificationService] Email configuration failed:', error.message);
      }
    }
  }

  // Set Socket.IO instance
  setIo(io) {
    ioInstance = io;
  }

  static setIo(io) {
    ioInstance = io;
  }

  // Get available event types
  getEventTypes() {
    return this.eventTypes;
  }

  // Create default preferences for new user
  async createDefaultPreferences(userId) {
    const defaultTypes = ['budget_alert', 'budget_breach', 'goal_achieved', 'security_alert', 'recurring_reminder'];

    const preferences = new NotificationPreferences({
      user: userId,
      channels: {
        email: {
          enabled: true,
          types: defaultTypes
        },
        push: {
          enabled: true,
          subscription: null,
          types: defaultTypes
        },
        sms: {
          enabled: false,
          phoneNumber: null,
          types: ['security_alert']
        },
        webhook: {
          enabled: false,
          url: null,
          secret: null,
          types: []
        }
      },
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00',
        timezone: 'UTC'
      },
      frequency: {
        budget_alerts: 'immediate',
        goal_updates: 'daily',
        expense_summaries: 'weekly'
      }
    });

    await preferences.save();
    return preferences;
  }

  // Determine which channels to use based on preferences
  determineChannels(type, preferences) {
    const eventConfig = this.eventTypes[type] || this.eventTypes.system;
    let channels = ['in_app']; // Always include in-app

    if (!preferences) {
      return eventConfig.defaultChannels;
    }

    // Check each channel
    if (preferences.channels.email.enabled &&
      preferences.channels.email.types?.includes(type)) {
      channels.push('email');
    }

    if (preferences.channels.push.enabled &&
      preferences.channels.push.subscription &&
      preferences.channels.push.types?.includes(type)) {
      channels.push('push');
    }

    if (preferences.channels.sms.enabled &&
      preferences.channels.sms.phoneNumber &&
      preferences.channels.sms.types?.includes(type)) {
      channels.push('sms');
    }

    if (preferences.channels.webhook.enabled &&
      preferences.channels.webhook.url &&
      preferences.channels.webhook.types?.includes(type)) {
      channels.push('webhook');
    }

    return channels;
  }

  // Check if within quiet hours
  isQuietHours(preferences) {
    if (!preferences?.quietHours?.enabled) return false;

    const now = new Date();
    const timezone = preferences.quietHours.timezone || 'UTC';

    // Get current time in user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const currentTime = formatter.format(now);
    const start = preferences.quietHours.start;
    const end = preferences.quietHours.end;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (start > end) {
      return currentTime >= start || currentTime <= end;
    }

    return currentTime >= start && currentTime <= end;
  }

  // Main notification dispatcher
  async sendNotification(userId, notificationData) {
    try {
      // Get user preferences
      let preferences = await NotificationPreferences.findOne({ user: userId });
      if (!preferences) {
        preferences = await this.createDefaultPreferences(userId);
      }

      const eventConfig = this.eventTypes[notificationData.type] || this.eventTypes.system;

      // Check quiet hours (bypass for critical notifications)
      const isCritical = notificationData.priority === 'critical' || eventConfig.priority === 'critical';
      if (!isCritical && this.isQuietHours(preferences)) {
        // Schedule for after quiet hours
        notificationData.scheduledFor = this.getEndOfQuietHours(preferences);
      }

      // Determine channels
      const channels = this.determineChannels(notificationData.type, preferences);

      // Create notification record
      const notification = new Notification({
        user: userId,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type,
        priority: notificationData.priority || eventConfig.priority,
        channels,
        data: {
          ...notificationData.data,
          icon: eventConfig.icon
        },
        scheduledFor: notificationData.scheduledFor,
        expiresAt: notificationData.expiresAt
      });

      await notification.save();

      // If scheduled for later, don't send now
      if (notification.scheduledFor && notification.scheduledFor > new Date()) {
        return notification;
      }

      // Dispatch to all channels
      const deliveryResults = await this.dispatchToChannels(notification, preferences);

      // Update delivery status
      for (const [channel, result] of Object.entries(deliveryResults)) {
        if (result.success) {
          notification.delivered[channel] = true;
          notification.deliveredAt[channel] = new Date();
        }
      }

      await notification.save();
      return notification;
    } catch (error) {
      console.error('[NotificationService] Send notification error:', error);
      throw error;
    }
  }

  // Dispatch to all enabled channels
  async dispatchToChannels(notification, preferences) {
    const results = {};
    const channels = notification.channels;

    const dispatchers = {
      in_app: () => this.sendInAppNotification(notification),
      email: () => this.sendEmailNotification(notification, preferences),
      push: () => this.sendPushNotification(notification, preferences),
      sms: () => this.sendSMSNotification(notification, preferences),
      webhook: () => this.sendWebhookNotification(notification, preferences)
    };

    const promises = channels.map(async (channel) => {
      if (dispatchers[channel]) {
        try {
          const result = await dispatchers[channel]();
          results[channel] = { success: result, error: null };
        } catch (error) {
          results[channel] = { success: false, error: error.message };
        }
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  // In-App notification via Socket.IO
  async sendInAppNotification(notification) {
    try {
      if (ioInstance) {
        const eventConfig = this.eventTypes[notification.type] || {};

        ioInstance.to(`user_${notification.user}`).emit('notification', {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          priority: notification.priority,
          icon: eventConfig.icon || 'ℹ️',
          data: notification.data,
          timestamp: notification.createdAt,
          actionUrl: notification.data?.actionUrl
        });

        // Also emit to notification bell counter update
        const unreadCount = await Notification.countDocuments({
          user: notification.user,
          read: false
        });

        ioInstance.to(`user_${notification.user}`).emit('notification_count', {
          count: unreadCount
        });

        return true;
      }
      return false;
    } catch (error) {
      console.error('[NotificationService] In-app notification error:', error);
      return false;
    }
  }

  // Email notification
  async sendEmailNotification(notification, preferences) {
    if (!this.emailTransporter) {
      console.log('[NotificationService] Email not configured');
      return false;
    }

    try {
      const User = require('../models/User');
      const user = await User.findById(notification.user).select('email name');

      if (!user?.email) return false;

      const eventConfig = this.eventTypes[notification.type] || {};

      const htmlContent = this.generateEmailHTML(notification, user, eventConfig);

      await this.emailTransporter.sendMail({
        from: `"ExpenseFlow" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: `${eventConfig.icon || ''} ${notification.title}`,
        text: notification.message,
        html: htmlContent
      });

      return true;
    } catch (error) {
      console.error('[NotificationService] Email notification error:', error);
      return false;
    }
  }

  // Generate HTML email template
  generateEmailHTML(notification, user, eventConfig) {
    const priorityColors = {
      low: '#6B7280',
      medium: '#3B82F6',
      high: '#F59E0B',
      critical: '#EF4444'
    };

    const priorityColor = priorityColors[notification.priority] || '#3B82F6';
    const actionUrl = notification.data?.actionUrl || process.env.FRONTEND_URL || 'http://localhost:3000';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td>
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">ExpenseFlow</h1>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <div style="background: ${priorityColor}15; border-left: 4px solid ${priorityColor}; padding: 15px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
            <span style="font-size: 24px; margin-right: 10px;">${eventConfig.icon || 'ℹ️'}</span>
            <span style="font-size: 18px; font-weight: 600; color: #1F2937;">${notification.title}</span>
          </div>
          
          <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
            Hi ${user.name || 'there'},
          </p>
          
          <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
            ${notification.message}
          </p>
          
          ${notification.data?.details ? `
            <div style="background: #F9FAFB; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <pre style="margin: 0; font-size: 13px; color: #6B7280; white-space: pre-wrap;">${JSON.stringify(notification.data.details, null, 2)}</pre>
            </div>
          ` : ''}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${actionUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">
              View in ExpenseFlow
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
          
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            You received this email because you have notifications enabled for ${eventConfig.name || notification.type}.
            <br>
            <a href="${actionUrl}/settings/notifications" style="color: #6B7280;">Manage notification preferences</a>
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  // Web Push notification
  async sendPushNotification(notification, preferences) {
    if (!preferences?.channels?.push?.subscription) {
      return false;
    }

    try {
      const eventConfig = this.eventTypes[notification.type] || {};

      const payload = JSON.stringify({
        title: notification.title,
        body: notification.message,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        tag: notification.type,
        data: {
          notificationId: notification._id,
          type: notification.type,
          url: notification.data?.actionUrl || '/',
          timestamp: notification.createdAt
        },
        actions: [
          { action: 'view', title: 'View' },
          { action: 'dismiss', title: 'Dismiss' }
        ],
        requireInteraction: notification.priority === 'critical' || notification.priority === 'high'
      });

      await webpush.sendNotification(
        preferences.channels.push.subscription,
        payload
      );

      return true;
    } catch (error) {
      console.error('[NotificationService] Push notification error:', error);

      // If subscription is invalid, remove it
      if (error.statusCode === 410 || error.statusCode === 404) {
        await NotificationPreferences.findOneAndUpdate(
          { user: notification.user },
          {
            'channels.push.subscription': null,
            'channels.push.enabled': false
          }
        );
      }

      return false;
    }
  }

  // SMS notification via Twilio
  async sendSMSNotification(notification, preferences) {
    if (!twilioClient || !preferences?.channels?.sms?.phoneNumber) {
      return false;
    }

    try {
      const message = `ExpenseFlow: ${notification.title}\n${notification.message}`;

      await twilioClient.messages.create({
        body: message.substring(0, 160), // SMS character limit
        from: process.env.TWILIO_PHONE_NUMBER,
        to: preferences.channels.sms.phoneNumber
      });

      return true;
    } catch (error) {
      console.error('[NotificationService] SMS notification error:', error);
      return false;
    }
  }

  // Webhook notification
  async sendWebhookNotification(notification, preferences) {
    if (!preferences?.channels?.webhook?.url) {
      return false;
    }

    try {
      const payload = {
        event: notification.type,
        timestamp: new Date().toISOString(),
        data: {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          priority: notification.priority,
          extra: notification.data
        }
      };

      // Generate signature if secret is provided
      const headers = { 'Content-Type': 'application/json' };

      if (preferences.channels.webhook.secret) {
        const crypto = require('crypto');
        const signature = crypto
          .createHmac('sha256', preferences.channels.webhook.secret)
          .update(JSON.stringify(payload))
          .digest('hex');
        headers['X-ExpenseFlow-Signature'] = signature;
      }

      await axios.post(preferences.channels.webhook.url, payload, {
        headers,
        timeout: 10000
      });

      return true;
    } catch (error) {
      console.error('[NotificationService] Webhook notification error:', error);
      return false;
    }
  }

  // Get end of quiet hours for scheduling
  getEndOfQuietHours(preferences) {
    const now = new Date();
    const [endHour, endMinute] = preferences.quietHours.end.split(':').map(Number);

    const endTime = new Date(now);
    endTime.setHours(endHour, endMinute, 0, 0);

    // If end time is before now, it's tomorrow
    if (endTime <= now) {
      endTime.setDate(endTime.getDate() + 1);
    }

    return endTime;
  }

  // Get user notifications with pagination
  async getUserNotifications(userId, options = {}) {
    const { page = 1, limit = 20, unreadOnly = false, type = null } = options;

    const query = { user: userId };
    if (unreadOnly) query.read = false;
    if (type) query.type = type;

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query)
    ]);

    // Add icons to notifications
    const notificationsWithIcons = notifications.map(n => ({
      ...n,
      icon: this.eventTypes[n.type]?.icon || 'ℹ️'
    }));

    return {
      notifications: notificationsWithIcons,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { read: true, readAt: new Date() },
      { new: true }
    );

    // Emit updated count
    if (ioInstance && notification) {
      const unreadCount = await Notification.countDocuments({
        user: userId,
        read: false
      });

      ioInstance.to(`user_${userId}`).emit('notification_count', {
        count: unreadCount
      });
    }

    return notification;
  }

  // Mark all as read
  async markAllAsRead(userId) {
    await Notification.updateMany(
      { user: userId, read: false },
      { read: true, readAt: new Date() }
    );

    // Emit updated count
    if (ioInstance) {
      ioInstance.to(`user_${userId}`).emit('notification_count', { count: 0 });
    }
  }

  // Delete notification
  async deleteNotification(notificationId, userId) {
    await Notification.deleteOne({ _id: notificationId, user: userId });

    // Emit updated count
    if (ioInstance) {
      const unreadCount = await Notification.countDocuments({
        user: userId,
        read: false
      });

      ioInstance.to(`user_${userId}`).emit('notification_count', {
        count: unreadCount
      });
    }
  }

  // Send bulk notifications (for announcements)
  async sendBulkNotification(userIds, notificationData) {
    const results = { success: 0, failed: 0 };

    for (const userId of userIds) {
      try {
        await this.sendNotification(userId, notificationData);
        results.success++;
      } catch (error) {
        results.failed++;
      }
    }

    return results;
  }

  // Process scheduled notifications (called by cron)
  async processScheduledNotifications() {
    const now = new Date();

    const scheduled = await Notification.find({
      scheduledFor: { $lte: now },
      'delivered.in_app': false
    });

    for (const notification of scheduled) {
      const preferences = await NotificationPreferences.findOne({
        user: notification.user
      });

      await this.dispatchToChannels(notification, preferences);

      notification.delivered.in_app = true;
      notification.deliveredAt.in_app = now;
      await notification.save();
    }

    return scheduled.length;
  }

  // Send notification helpers for common events
  async notifyBudgetAlert(userId, budgetData) {
    return this.sendNotification(userId, {
      title: `Budget Alert: ${budgetData.category}`,
      message: `You've used ${budgetData.percentUsed}% of your ${budgetData.category} budget (${budgetData.spent}/${budgetData.limit})`,
      type: budgetData.percentUsed >= 100 ? 'budget_breach' : 'budget_alert',
      priority: budgetData.percentUsed >= 100 ? 'critical' : 'high',
      data: {
        budgetId: budgetData.budgetId,
        category: budgetData.category,
        spent: budgetData.spent,
        limit: budgetData.limit,
        percentUsed: budgetData.percentUsed,
        actionUrl: '/budgets'
      }
    });
  }

  async notifyGoalAchieved(userId, goalData) {
    return this.sendNotification(userId, {
      title: `Goal Achieved: ${goalData.name}! 🎉`,
      message: `Congratulations! You've reached your savings goal of ${goalData.targetAmount}!`,
      type: 'goal_achieved',
      priority: 'medium',
      data: {
        goalId: goalData.goalId,
        goalId: goalData.goalId,
        name: goalData.name,
        targetAmount: goalData.targetAmount,
        actionUrl: '/goals'
      }
    });
  }

  async notifyApprovalRequired(approverId, submissionData) {
    return this.sendNotification(approverId, {
      title: 'Approval Required',
      message: `${submissionData.submitterName} submitted an expense of ₹${submissionData.amount} for approval.`,
      type: 'approval_required',
      priority: 'high',
      data: {
        submissionId: submissionData.id,
        amount: submissionData.amount,
        description: submissionData.description,
        actionUrl: '/approval-dashboard.html'
      }
    });
  }

  async notifyApprovalDecision(submitterId, decisionData) {
    const isApproved = decisionData.status === 'approved';
    return this.sendNotification(submitterId, {
      title: `Expense ${isApproved ? 'Approved' : 'Rejected'}`,
      message: `Your expense for ${decisionData.description} has been ${decisionData.status} by ${decisionData.approverName}.`,
      type: 'approval_decision',
      priority: isApproved ? 'medium' : 'high',
      data: {
        submissionId: decisionData.id,
        status: decisionData.status,
        comment: decisionData.comment,
        actionUrl: '/approval-dashboard.html'
      }
    });
  }

  async notifyRecurringReminder(userId, recurringData) {
    return this.sendNotification(userId, {
      title: `Upcoming: ${recurringData.name}`,
      message: `${recurringData.name} (${recurringData.amount}) is due on ${recurringData.dueDate}`,
      type: 'recurring_reminder',
      priority: 'medium',
      data: {
        recurringId: recurringData.recurringId,
        name: recurringData.name,
        amount: recurringData.amount,
        dueDate: recurringData.dueDate,
        actionUrl: '/recurring'
      }
    });
  }

  async notifySecurityAlert(userId, alertData) {
    return this.sendNotification(userId, {
      title: `Security Alert: ${alertData.title}`,
      message: alertData.message,
      type: 'security_alert',
      priority: 'critical',
      data: {
        alertType: alertData.alertType,
        ip: alertData.ip,
        device: alertData.device,
        location: alertData.location,
        actionUrl: '/settings/security'
      }
    });
  }
}

module.exports = new NotificationService();
