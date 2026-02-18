const User = require('../models/User');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const TwoFactorAuth = require('../models/TwoFactorAuth');
const emailService = require('./emailService');
const notificationService = require('./notificationService');
const suspiciousLoginDetectionService = require('./suspiciousLoginDetectionService');

/**
 * Account Takeover Alerting Service
 * Issue #561: Account Takeover Alerting
 * 
 * Triggers multi-channel alerts (email/SMS/push) for:
 * - New device logins
 * - Password changes
 * - 2FA configuration changes
 * - Suspicious login attempts
 * - Account modifications
 */

class AccountTakeoverAlertingService {
  /**
   * Alert on new device login
   * @param {string} userId - User ID
   * @param {object} loginInfo - Login information (device, location, IP, userAgent)
   * @param {object} sessionData - Session data
   * @returns {Promise<{sent: boolean, channels: string[]}>}
   */
  async alertNewDeviceLogin(userId, loginInfo, sessionData) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      // Check if this might be a suspicious login
      const suspiciousCheck = await suspiciousLoginDetectionService.analyzeLoginAttempt(
        userId,
        loginInfo
      );

      // Build alert context
      const alertContext = {
        eventType: 'NEW_DEVICE_LOGIN',
        severity: suspiciousCheck.riskScore >= 70 ? 'high' : 'medium',
        deviceInfo: {
          name: loginInfo.deviceName || this._getDeviceNameFromUserAgent(loginInfo.userAgent),
          type: loginInfo.deviceType || 'unknown',
          os: loginInfo.os || 'Unknown',
          browser: loginInfo.browser || 'Unknown',
          ipAddress: loginInfo.ipAddress,
          location: loginInfo.location
        },
        riskScore: suspiciousCheck.riskScore,
        suspiciousFlags: suspiciousCheck.flags,
        timestamp: new Date(),
        sessionId: sessionData?._id
      };

      // Prepare notification data
      const notificationData = this._buildDeviceLoginNotificationData(user, alertContext);

      // Send multi-channel alerts
      const channels = [];

      // Email alert (always for high risk)
      if (alertContext.severity === 'high' || user.preferences?.securityAlerts?.email !== false) {
        await this._sendDeviceLoginEmail(user, alertContext);
        channels.push('email');
      }

      // SMS alert (if enabled and high risk)
      if (alertContext.severity === 'high' && user.phone && user.preferences?.securityAlerts?.sms !== false) {
        await this._sendDeviceLoginSMS(user, alertContext);
        channels.push('sms');
      }

      // Push notification
      if (user.preferences?.securityAlerts?.push !== false) {
        await notificationService.sendPushNotification(userId, {
          title: 'New Device Login Detected',
          body: `${alertContext.deviceInfo.name} from ${alertContext.deviceInfo.location?.city || 'Unknown Location'}`,
          icon: '🔐',
          data: {
            type: 'DEVICE_LOGIN',
            riskScore: alertContext.riskScore,
            sessionId: alertContext.sessionId
          }
        });
        channels.push('push');
      }

      // In-app notification (always)
      await notificationService.createNotification(userId, {
        type: 'SECURITY_ALERT',
        title: 'New Device Login',
        message: `A new login was detected from ${alertContext.deviceInfo.name} (${alertContext.deviceInfo.location?.city || 'Unknown'}, ${alertContext.deviceInfo.ipAddress})`,
        data: notificationData,
        priority: alertContext.severity === 'high' ? 'critical' : 'high',
        actionable: true,
        actions: [
          {
            label: 'Review Activity',
            action: 'review_login_activity',
            data: { sessionId: alertContext.sessionId }
          },
          {
            label: 'Revoke Session',
            action: 'revoke_session',
            data: { sessionId: alertContext.sessionId }
          },
          {
            label: 'Verify It\'s Me',
            action: 'verify_login',
            data: { sessionId: alertContext.sessionId }
          }
        ]
      });
      channels.push('in_app');

      // Log the alert event
      await AuditLog.create({
        userId,
        action: 'ACCOUNT_TAKEOVER_ALERT_DEVICE_LOGIN',
        actionType: 'security',
        resourceType: 'Security',
        severity: alertContext.severity,
        details: {
          deviceInfo: alertContext.deviceInfo,
          riskScore: alertContext.riskScore,
          suspiciousFlags: alertContext.suspiciousFlags,
          notificationChannels: channels
        }
      });

      return {
        sent: true,
        channels,
        riskScore: alertContext.riskScore,
        alertContext
      };
    } catch (error) {
      console.error('Error sending device login alert:', error);
      throw error;
    }
  }

  /**
   * Alert on password change
   * @param {string} userId - User ID
   * @param {object} changeInfo - Change information (IP, userAgent, timestamp)
   * @returns {Promise<{sent: boolean, channels: string[]}>}
   */
  async alertPasswordChange(userId, changeInfo) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const alertContext = {
        eventType: 'PASSWORD_CHANGED',
        severity: 'high',
        timestamp: changeInfo.timestamp || new Date(),
        ipAddress: changeInfo.ipAddress,
        location: changeInfo.location,
        userAgent: changeInfo.userAgent,
        initiatedBy: changeInfo.initiatedBy || 'user' // 'user', 'admin', 'password_reset'
      };

      // Send multi-channel alerts
      const channels = [];

      // Email alert (always)
      await this._sendPasswordChangeEmail(user, alertContext);
      channels.push('email');

      // SMS alert (if high risk circumstances)
      if (user.phone && (alertContext.initiatedBy !== 'user' || changeInfo.isSubsequentChange)) {
        await this._sendPasswordChangeSMS(user, alertContext);
        channels.push('sms');
      }

      // Push notification
      if (user.preferences?.securityAlerts?.push !== false) {
        await notificationService.sendPushNotification(userId, {
          title: 'Password Changed',
          body: `Your ExpenseFlow password was changed from ${alertContext.location?.city || 'Unknown Location'}`,
          icon: '🔑',
          data: {
            type: 'PASSWORD_CHANGED',
            timestamp: alertContext.timestamp
          }
        });
        channels.push('push');
      }

      // In-app notification
      await notificationService.createNotification(userId, {
        type: 'SECURITY_ALERT',
        title: 'Password Changed',
        message: `Your password was successfully changed from ${alertContext.location?.city || 'Unknown Location'} (${alertContext.ipAddress})`,
        data: {
          eventType: alertContext.eventType,
          timestamp: alertContext.timestamp,
          ipAddress: alertContext.ipAddress
        },
        priority: 'high',
        actionable: true,
        actions: [
          {
            label: 'Wasn\'t You?',
            action: 'report_unauthorized_change',
            data: { timestamp: alertContext.timestamp }
          },
          {
            label: 'Review Security',
            action: 'review_security',
            data: {}
          }
        ]
      });
      channels.push('in_app');

      // Log the alert
      await AuditLog.create({
        userId,
        action: 'ACCOUNT_TAKEOVER_ALERT_PASSWORD_CHANGE',
        actionType: 'security',
        resourceType: 'Security',
        severity: alertContext.severity,
        details: {
          initiatedBy: alertContext.initiatedBy,
          ipAddress: alertContext.ipAddress,
          location: alertContext.location,
          notificationChannels: channels
        }
      });

      return {
        sent: true,
        channels,
        alertContext
      };
    } catch (error) {
      console.error('Error sending password change alert:', error);
      throw error;
    }
  }

  /**
   * Alert on 2FA configuration change
   * @param {string} userId - User ID
   * @param {object} changeInfo - Change information (action, method, ipAddress, location, userAgent)
   * @returns {Promise<{sent: boolean, channels: string[]}>}
   */
  async alertTwoFAChange(userId, changeInfo) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const actionDescriptions = {
        'enabled': 'Two-factor authentication was enabled',
        'disabled': 'Two-factor authentication was DISABLED',
        'method_changed': 'Two-factor authentication method was changed',
        'backup_codes_regenerated': 'Backup codes were regenerated',
        'phone_verified': 'Phone number was verified for SMS 2FA',
        'email_verified': 'Email was verified for email 2FA'
      };

      const alertContext = {
        eventType: '2FA_CHANGE',
        action: changeInfo.action,
        method: changeInfo.method,
        severity: changeInfo.action === 'disabled' ? 'critical' : 'high',
        timestamp: changeInfo.timestamp || new Date(),
        ipAddress: changeInfo.ipAddress,
        location: changeInfo.location,
        userAgent: changeInfo.userAgent,
        actionDescription: actionDescriptions[changeInfo.action] || 'Two-factor authentication was modified'
      };

      // For critical actions (disable), always send alerts
      const isCritical = alertContext.severity === 'critical';

      const channels = [];

      // Email alert (always)
      await this._send2FAChangeEmail(user, alertContext);
      channels.push('email');

      // SMS alert (for critical actions)
      if (isCritical && user.phone && user.preferences?.securityAlerts?.sms !== false) {
        await this._send2FAChangeSMS(user, alertContext);
        channels.push('sms');
      }

      // Push notification
      if (user.preferences?.securityAlerts?.push !== false) {
        await notificationService.sendPushNotification(userId, {
          title: '2FA Configuration Changed',
          body: alertContext.actionDescription,
          icon: '🔐',
          tag: '2fa_change',
          data: {
            type: '2FA_CHANGE',
            action: changeInfo.action,
            severity: alertContext.severity
          }
        });
        channels.push('push');
      }

      // In-app notification
      await notificationService.createNotification(userId, {
        type: 'SECURITY_ALERT',
        title: '2FA Configuration Changed',
        message: alertContext.actionDescription,
        data: {
          eventType: alertContext.eventType,
          action: alertContext.action,
          method: alertContext.method,
          timestamp: alertContext.timestamp,
          ipAddress: alertContext.ipAddress
        },
        priority: isCritical ? 'critical' : 'high',
        actionable: isCritical,
        actions: isCritical ? [
          {
            label: 'Undo This Change',
            action: 'undo_2fa_change',
            data: { changeId: changeInfo.changeId }
          },
          {
            label: 'Review 2FA',
            action: 'review_2fa',
            data: {}
          }
        ] : []
      });
      channels.push('in_app');

      // Log the alert
      await AuditLog.create({
        userId,
        action: 'ACCOUNT_TAKEOVER_ALERT_2FA_CHANGE',
        actionType: 'security',
        resourceType: 'Security',
        severity: alertContext.severity,
        details: {
          action: alertContext.action,
          method: alertContext.method,
          ipAddress: alertContext.ipAddress,
          location: alertContext.location,
          notificationChannels: channels
        }
      });

      // For disabled 2FA, log critical alert
      if (alertContext.action === 'disabled') {
        await AuditLog.create({
          userId,
          action: 'CRITICAL_ALERT_2FA_DISABLED',
          actionType: 'security',
          resourceType: 'TwoFactorAuth',
          severity: 'critical',
          details: {
            ipAddress: alertContext.ipAddress,
            location: alertContext.location,
            userAgent: alertContext.userAgent
          }
        });
      }

      return {
        sent: true,
        channels,
        isCritical,
        alertContext
      };
    } catch (error) {
      console.error('Error sending 2FA change alert:', error);
      throw error;
    }
  }

  /**
   * Alert on suspicious login attempt
   * @param {string} userId - User ID
   * @param {object} suspiciousData - Suspicious login data
   * @returns {Promise<{sent: boolean, channels: string[]}>}
   */
  async alertSuspiciousLogin(userId, suspiciousData) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const alertContext = {
        eventType: 'SUSPICIOUS_LOGIN_ATTEMPT',
        severity: suspiciousData.severity || 'high',
        riskScore: suspiciousData.riskScore,
        flags: suspiciousData.flags || [],
        timestamp: suspiciousData.timestamp || new Date(),
        ipAddress: suspiciousData.ipAddress,
        location: suspiciousData.location,
        userAgent: suspiciousData.userAgent
      };

      const channels = [];

      // Email alert (high risk)
      if (alertContext.severity === 'high' || alertContext.severity === 'critical') {
        await this._sendSuspiciousLoginEmail(user, alertContext);
        channels.push('email');
      }

      // SMS alert (critical risk)
      if (alertContext.severity === 'critical' && user.phone && user.preferences?.securityAlerts?.sms !== false) {
        await this._sendSuspiciousLoginSMS(user, alertContext);
        channels.push('sms');
      }

      // Push notification
      if (user.preferences?.securityAlerts?.push !== false) {
        await notificationService.sendPushNotification(userId, {
          title: 'Suspicious Login Attempt',
          body: `Login from ${alertContext.location?.city || 'Unknown Location'} was blocked`,
          icon: '🚨',
          tag: 'suspicious_login',
          data: {
            type: 'SUSPICIOUS_LOGIN',
            riskScore: alertContext.riskScore,
            flags: alertContext.flags
          }
        });
        channels.push('push');
      }

      // In-app notification
      let actionLabels = [];
      if (alertContext.flags.includes('IMPOSSIBLE_TRAVEL')) {
        actionLabels.push({
          label: 'Verify It\'s You (Impossible Travel Detected)',
          action: 'verify_impossible_travel',
          data: {}
        });
      }

      await notificationService.createNotification(userId, {
        type: 'SECURITY_ALERT',
        title: 'Suspicious Login Attempt Blocked',
        message: `A login attempt from ${alertContext.location?.city || 'Unknown Location'} (${alertContext.ipAddress}) was detected as suspicious (Risk: ${alertContext.riskScore}%)`,
        data: {
          eventType: alertContext.eventType,
          riskScore: alertContext.riskScore,
          flags: alertContext.flags,
          timestamp: alertContext.timestamp
        },
        priority: 'critical',
        actionable: true,
        actions: [
          ...actionLabels,
          {
            label: 'Review Security',
            action: 'review_security',
            data: {}
          },
          {
            label: 'Change Password',
            action: 'change_password',
            data: {}
          }
        ]
      });
      channels.push('in_app');

      // Log the alert
      await AuditLog.create({
        userId,
        action: 'ACCOUNT_TAKEOVER_ALERT_SUSPICIOUS_LOGIN',
        actionType: 'security',
        resourceType: 'Security',
        severity: alertContext.severity,
        details: {
          riskScore: alertContext.riskScore,
          flags: alertContext.flags,
          ipAddress: alertContext.ipAddress,
          location: alertContext.location,
          notificationChannels: channels
        }
      });

      return {
        sent: true,
        channels,
        riskScore: alertContext.riskScore,
        alertContext
      };
    } catch (error) {
      console.error('Error sending suspicious login alert:', error);
      throw error;
    }
  }

  /**
   * Alert on account modification
   * @param {string} userId - User ID
   * @param {object} modificationInfo - Modification information (action, details, ipAddress, location)
   * @returns {Promise<{sent: boolean, channels: string[]}>}
   */
  async alertAccountModification(userId, modificationInfo) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const modificationDescriptions = {
        'email_changed': 'Email address was changed',
        'phone_changed': 'Phone number was changed',
        'account_deleted': 'Account deletion initiated',
        'recovery_email_set': 'Recovery email was configured',
        'session_revoked': 'Active session was revoked'
      };

      const alertContext = {
        eventType: 'ACCOUNT_MODIFICATION',
        action: modificationInfo.action,
        severity: modificationInfo.action === 'account_deleted' ? 'critical' : 'high',
        timestamp: modificationInfo.timestamp || new Date(),
        ipAddress: modificationInfo.ipAddress,
        location: modificationInfo.location,
        actionDescription: modificationDescriptions[modificationInfo.action] || 'Account was modified'
      };

      const channels = [];

      // Email alert (always)
      await this._sendAccountModificationEmail(user, alertContext);
      channels.push('email');

      // SMS alert (for critical actions)
      if (alertContext.severity === 'critical' && user.phone && user.preferences?.securityAlerts?.sms !== false) {
        await this._sendAccountModificationSMS(user, alertContext);
        channels.push('sms');
      }

      // Push notification
      if (user.preferences?.securityAlerts?.push !== false) {
        await notificationService.sendPushNotification(userId, {
          title: 'Account Modification Detected',
          body: alertContext.actionDescription,
          icon: '⚠️',
          data: {
            type: 'ACCOUNT_MODIFICATION',
            action: alertContext.action
          }
        });
        channels.push('push');
      }

      // In-app notification
      await notificationService.createNotification(userId, {
        type: 'SECURITY_ALERT',
        title: 'Account Modified',
        message: alertContext.actionDescription,
        data: {
          eventType: alertContext.eventType,
          action: alertContext.action,
          timestamp: alertContext.timestamp
        },
        priority: alertContext.severity === 'critical' ? 'critical' : 'high',
        actionable: alertContext.severity === 'critical'
      });
      channels.push('in_app');

      // Log the alert
      await AuditLog.create({
        userId,
        action: 'ACCOUNT_TAKEOVER_ALERT_MODIFICATION',
        actionType: 'security',
        resourceType: 'Security',
        severity: alertContext.severity,
        details: {
          action: alertContext.action,
          ipAddress: alertContext.ipAddress,
          location: alertContext.location,
          notificationChannels: channels
        }
      });

      return {
        sent: true,
        channels,
        alertContext
      };
    } catch (error) {
      console.error('Error sending account modification alert:', error);
      throw error;
    }
  }

  /**
   * Private: Send device login email
   * @private
   */
  async _sendDeviceLoginEmail(user, alertContext) {
    try {
      const { deviceInfo, riskScore } = alertContext;
      const riskLevel = riskScore >= 85 ? 'High Risk' : riskScore >= 70 ? 'Medium Risk' : 'Low Risk';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">🔐 New Device Login Detected</h2>
          </div>
          
          <div style="padding: 20px; background: #f8f9fa;">
            <p>Hi ${user.name},</p>
            
            <p>A new device login was detected on your ExpenseFlow account.</p>
            
            <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #667eea;">
              <h3 style="margin-top: 0;">Login Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Device:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${deviceInfo.name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Type:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${deviceInfo.os} • ${deviceInfo.browser}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Location:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${deviceInfo.location?.city || 'Unknown'}, ${deviceInfo.location?.country || 'Unknown'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>IP Address:</strong></td>
                  <td style="padding: 8px 0; text-align: right;">${deviceInfo.ipAddress}</td>
                </tr>
              </table>
            </div>
            
            <div style="background: ${riskScore >= 85 ? '#fff3cd' : '#d4edda'}; padding: 12px; border-radius: 5px; margin: 15px 0; border-left: 4px solid ${riskScore >= 85 ? '#ffc107' : '#28a745'};">
              <strong>Risk Level: ${riskLevel}</strong>
            </div>
            
            <p style="margin: 20px 0;"><strong>Is this you?</strong></p>
            <div style="text-align: center; margin: 20px 0;">
              <a href="${process.env.FRONTEND_URL}/security/sessions" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Review This Login</a>
            </div>
            
            <div style="background: #fff8dc; padding: 12px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107;">
              <strong>⚠️ Important:</strong> If this wasn't you, please review your security settings immediately.
            </div>
            
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              This is an automated security alert from ExpenseFlow. 
              Do not reply to this email.
            </p>
          </div>
        </div>
      `;

      await emailService.sendEmail({
        to: user.email,
        subject: `🔐 New Device Login - ${alertContext.severity === 'high' ? 'ACTION REQUIRED' : 'Notification'}`,
        html
      });
    } catch (error) {
      console.error('Error sending device login email:', error);
    }
  }

  /**
   * Private: Send password change email
   * @private
   */
  async _sendPasswordChangeEmail(user, alertContext) {
    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">🔑 Password Changed</h2>
          </div>
          
          <div style="padding: 20px; background: #f8f9fa;">
            <p>Hi ${user.name},</p>
            
            <p>Your ExpenseFlow password was successfully changed.</p>
            
            <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #667eea;">
              <h3 style="margin-top: 0;">Change Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Time:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${new Date().toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Location:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${alertContext.location?.city || 'Unknown'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>IP Address:</strong></td>
                  <td style="padding: 8px 0; text-align: right;">${alertContext.ipAddress}</td>
                </tr>
              </table>
            </div>
            
            <p>Any other active sessions on your account will remain active. You'll need to enter your new password on next login.</p>
            
            <div style="background: #fff8dc; padding: 12px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107;">
              <strong>⚠️ Didn't change your password?</strong> 
              <p>If you didn't make this change, please change your password immediately and review your account activity.</p>
              <a href="${process.env.FRONTEND_URL}/security/change-password" style="color: #667eea;">Change Password Now</a>
            </div>
            
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              This is an automated security alert from ExpenseFlow.
            </p>
          </div>
        </div>
      `;

      await emailService.sendEmail({
        to: user.email,
        subject: '🔑 Your ExpenseFlow Password Was Changed',
        html
      });
    } catch (error) {
      console.error('Error sending password change email:', error);
    }
  }

  /**
   * Private: Send 2FA change email
   * @private
   */
  async _send2FAChangeEmail(user, alertContext) {
    try {
      const icons = {
        disabled: '⚠️',
        enabled: '✅',
        method_changed: '🔄',
        backup_codes_regenerated: '🔐'
      };

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">${icons[alertContext.action] || '🔐'} 2FA Configuration Changed</h2>
          </div>
          
          <div style="padding: 20px; background: #f8f9fa;">
            <p>Hi ${user.name},</p>
            
            <p>${alertContext.actionDescription}</p>
            
            <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid ${alertContext.severity === 'critical' ? '#dc3545' : '#667eea'};">
              <h3 style="margin-top: 0;">Change Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Time:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${alertContext.timestamp.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Location:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${alertContext.location?.city || 'Unknown'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>IP Address:</strong></td>
                  <td style="padding: 8px 0; text-align: right;">${alertContext.ipAddress}</td>
                </tr>
              </table>
            </div>
            
            ${alertContext.action === 'disabled' ? `
              <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #dc3545;">
                <strong>🚨 CRITICAL:</strong> 
                <p>Two-factor authentication has been disabled on your account. This reduces your account security.</p>
                <a href="${process.env.FRONTEND_URL}/security/2fa" style="color: #dc3545; font-weight: bold;">Re-enable 2FA Now</a>
              </div>
            ` : ''}
            
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              This is an automated security alert from ExpenseFlow.
            </p>
          </div>
        </div>
      `;

      await emailService.sendEmail({
        to: user.email,
        subject: `${alertContext.severity === 'critical' ? '🚨 CRITICAL: ' : ''}Two-Factor Authentication Changed`,
        html
      });
    } catch (error) {
      console.error('Error sending 2FA change email:', error);
    }
  }

  /**
   * Private: Send suspicious login email
   * @private
   */
  async _sendSuspiciousLoginEmail(user, alertContext) {
    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc3545; padding: 20px; color: white; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">🚨 Suspicious Login Attempt Blocked</h2>
          </div>
          
          <div style="padding: 20px; background: #f8f9fa;">
            <p>Hi ${user.name},</p>
            
            <p>A suspicious login attempt on your ExpenseFlow account was automatically blocked.</p>
            
            <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #dc3545;">
              <h3 style="margin-top: 0;">Attempt Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Time:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${alertContext.timestamp.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Location:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${alertContext.location?.city || 'Unknown'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>IP Address:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${alertContext.ipAddress}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Risk Score:</strong></td>
                  <td style="padding: 8px 0; text-align: right;">${alertContext.riskScore}%</td>
                </tr>
              </table>
            </div>
            
            <div style="background: #fff8dc; padding: 12px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107;">
              <strong>What to do:</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Change your password if you suspect unauthorized access</li>
                <li>Review your active sessions</li>
                <li>Enable two-factor authentication if not already enabled</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
              <a href="${process.env.FRONTEND_URL}/security/review-activity" style="background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Activity</a>
            </div>
            
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              This is an automated security alert from ExpenseFlow.
            </p>
          </div>
        </div>
      `;

      await emailService.sendEmail({
        to: user.email,
        subject: '🚨 Suspicious Login Attempt Blocked',
        html
      });
    } catch (error) {
      console.error('Error sending suspicious login email:', error);
    }
  }

  /**
   * Private: Send account modification email
   * @private
   */
  async _sendAccountModificationEmail(user, alertContext) {
    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">⚠️ Account Modification Detected</h2>
          </div>
          
          <div style="padding: 20px; background: #f8f9fa;">
            <p>Hi ${user.name},</p>
            
            <p>${alertContext.actionDescription}</p>
            
            <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #667eea;">
              <h3 style="margin-top: 0;">Modification Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Time:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${alertContext.timestamp.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Location:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${alertContext.location?.city || 'Unknown'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>IP Address:</strong></td>
                  <td style="padding: 8px 0; text-align: right;">${alertContext.ipAddress}</td>
                </tr>
              </table>
            </div>
            
            <p style="text-align: center; margin: 20px 0;">
              <a href="${process.env.FRONTEND_URL}/account/settings" style="color: #667eea;">View Account Settings</a>
            </p>
            
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              This is an automated security alert from ExpenseFlow.
            </p>
          </div>
        </div>
      `;

      await emailService.sendEmail({
        to: user.email,
        subject: '⚠️ Account Modification Detected',
        html
      });
    } catch (error) {
      console.error('Error sending account modification email:', error);
    }
  }

  /**
   * Private: Send SMS alerts
   * @private
   */
  async _sendDeviceLoginSMS(user, alertContext) {
    try {
      const message = `ExpenseFlow Alert: New login from ${alertContext.deviceInfo.name} (${alertContext.deviceInfo.location?.city || 'Unknown'}). Risk: ${alertContext.riskScore}%. Review: ${process.env.FRONTEND_URL}/security/sessions`;
      await notificationService.sendSMS(user.phone, message);
    } catch (error) {
      console.error('Error sending SMS:', error);
    }
  }

  async _sendPasswordChangeSMS(user, alertContext) {
    try {
      const message = `ExpenseFlow Alert: Your password was changed from ${alertContext.location?.city || 'Unknown'}. If this wasn't you, visit ${process.env.FRONTEND_URL}/account/recover`;
      await notificationService.sendSMS(user.phone, message);
    } catch (error) {
      console.error('Error sending SMS:', error);
    }
  }

  async _send2FAChangeSMS(user, alertContext) {
    try {
      const message = `🚨 ExpenseFlow ALERT: 2FA was ${alertContext.action === 'disabled' ? 'DISABLED' : alertContext.action === 'enabled' ? 'enabled' : 'modified'}. Review security at ${process.env.FRONTEND_URL}/security`;
      await notificationService.sendSMS(user.phone, message);
    } catch (error) {
      console.error('Error sending SMS:', error);
    }
  }

  async _sendSuspiciousLoginSMS(user, alertContext) {
    try {
      const message = `🚨 ExpenseFlow CRITICAL: Suspicious login from ${alertContext.location?.city || 'Unknown'} at ${alertContext.ipAddress} was blocked. Verify at ${process.env.FRONTEND_URL}/login`;
      await notificationService.sendSMS(user.phone, message);
    } catch (error) {
      console.error('Error sending SMS:', error);
    }
  }

  async _sendAccountModificationSMS(user, alertContext) {
    try {
      const message = `ExpenseFlow Alert: Account modification detected - ${alertContext.actionDescription}. Review: ${process.env.FRONTEND_URL}/account/settings`;
      await notificationService.sendSMS(user.phone, message);
    } catch (error) {
      console.error('Error sending SMS:', error);
    }
  }

  /**
   * Private helpers
   * @private
   */
  _getDeviceNameFromUserAgent(userAgent) {
    if (!userAgent) return 'Unknown Device';
    
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('iPad')) return 'iPad';
    if (userAgent.includes('Android')) return 'Android Device';
    if (userAgent.includes('Windows')) return 'Windows PC';
    if (userAgent.includes('Macintosh')) return 'Mac';
    if (userAgent.includes('Linux')) return 'Linux Device';
    
    return 'Unknown Device';
  }

  _buildDeviceLoginNotificationData(user, alertContext) {
    return {
      eventType: alertContext.eventType,
      deviceInfo: alertContext.deviceInfo,
      riskScore: alertContext.riskScore,
      timestamp: alertContext.timestamp,
      sessionId: alertContext.sessionId
    };
  }
}

module.exports = new AccountTakeoverAlertingService();
