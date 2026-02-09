const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const TwoFactorAuth = require('../models/TwoFactorAuth');
const TrustedDevice = require('../models/TrustedDevice');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const SecurityEvent = require('../models/SecurityEvent');
const emailService = require('./emailService');
// const fp = require('fingerprint-generator');

/**
 * 2FA Service
 * Issue #503: 2FA Management
 * Handles TOTP generation, verification, recovery codes, device trust, and 2FA method switching
 */

class TwoFactorAuthService {
  /**
   * Generate a new TOTP secret and QR code
   * @param {string} userId - User ID
   * @param {string} userEmail - User email
   * @returns {Promise<{secret, qrCode}>}
   */
  async generateTOTPSecret(userId, userEmail) {
    try {
      const secret = speakeasy.generateSecret({
        name: `ExpenseFlow (${userEmail})`,
        issuer: 'ExpenseFlow',
        length: 32
      });

      // Generate QR code
      const qrCode = await QRCode.toDataURL(secret.otpauth_url);

      // Store temporary secret
      let twoFAAuth = await TwoFactorAuth.findOne({ userId });
      if (!twoFAAuth) {
        twoFAAuth = new TwoFactorAuth({ userId });
      }

      twoFAAuth.setupSecret = secret.base32;
      twoFAAuth.setupSecretExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      twoFAAuth.setupAttempts = 0;
      await twoFAAuth.save();

      return {
        secret: secret.base32,
        qrCode: qrCode,
        manualEntryKey: secret.base32
      };
    } catch (error) {
      console.error('Error generating TOTP secret:', error);
      throw new Error('Failed to generate TOTP secret');
    }
  }

  /**
   * Verify TOTP code and complete setup
   * @param {string} userId - User ID
   * @param {string} totpCode - 6-digit TOTP code
   * @returns {Promise<{success: boolean, backupCodes?: string[]}>}
   */
  async verifyAndEnableTOTP(userId, totpCode) {
    try {
      const twoFAAuth = await TwoFactorAuth.findOne({ userId }).select('+setupSecret');

      if (!twoFAAuth || !twoFAAuth.setupSecret) {
        throw new Error('No setup in progress');
      }

      if (twoFAAuth.setupSecretExpires < new Date()) {
        throw new Error('Setup secret has expired. Please restart 2FA setup.');
      }

      // Verify the TOTP code
      const verified = speakeasy.totp.verify({
        secret: twoFAAuth.setupSecret,
        encoding: 'base32',
        token: totpCode,
        window: 2
      });

      if (!verified) {
        twoFAAuth.setupAttempts = (twoFAAuth.setupAttempts || 0) + 1;
        if (twoFAAuth.setupAttempts >= 3) {
          twoFAAuth.setupSecret = null;
          twoFAAuth.setupSecretExpires = null;
        }
        await twoFAAuth.save();
        throw new Error('Invalid TOTP code. Please try again.');
      }

      // Enable TOTP
      twoFAAuth.totpSecret = twoFAAuth.setupSecret;
      twoFAAuth.totpVerifiedAt = new Date();
      twoFAAuth.enabled = true;
      twoFAAuth.method = 'totp';
      twoFAAuth.enrolledAt = new Date();
      twoFAAuth.enrollmentCompletedAt = new Date();

      // Generate backup codes
      const backupCodes = twoFAAuth.generateBackupCodes(10);

      // Clear setup fields
      twoFAAuth.setupSecret = null;
      twoFAAuth.setupSecretExpires = null;
      twoFAAuth.setupAttempts = 0;

      await twoFAAuth.save();

      // Log the action
      await AuditLog.create({
        userId,
        action: '2FA_ENABLED',
        actionType: 'security',
        resourceType: 'TwoFactorAuth',
        details: {
          method: 'totp',
          backupCodesGenerated: backupCodes.length
        }
      });

      return {
        success: true,
        backupCodes: backupCodes,
        message: 'Two-factor authentication enabled successfully'
      };
    } catch (error) {
      console.error('Error verifying TOTP:', error);
      throw error;
    }
  }

  /**
   * Verify TOTP code during login
   * @param {string} userId - User ID
   * @param {string} totpCode - 6-digit TOTP code
   * @returns {Promise<boolean>}
   */
  async verifyTOTPCode(userId, totpCode) {
    try {
      const twoFAAuth = await TwoFactorAuth.findOne({ userId }).select('+totpSecret');

      if (!twoFAAuth || !twoFAAuth.enabled || !twoFAAuth.totpSecret) {
        throw new Error('2FA not enabled for this user');
      }

      // Check if account is locked
      if (twoFAAuth.isLocked()) {
        throw new Error('Too many failed attempts. Please try again later.');
      }

      // Verify the code
      const verified = speakeasy.totp.verify({
        secret: twoFAAuth.totpSecret,
        encoding: 'base32',
        token: totpCode,
        window: 2
      });

      if (!verified) {
        twoFAAuth.incrementFailedAttempts();
        await twoFAAuth.save();
        throw new Error('Invalid TOTP code');
      }

      // Reset failed attempts on successful verification
      twoFAAuth.resetFailedAttempts();
      twoFAAuth.lastUsedAt = new Date();
      await twoFAAuth.save();

      return true;
    } catch (error) {
      console.error('Error verifying TOTP code:', error);
      throw error;
    }
  }

  /**
   * Verify backup code
   * @param {string} userId - User ID
   * @param {string} backupCode - Backup code
   * @returns {Promise<boolean>}
   */
  async verifyBackupCode(userId, backupCode) {
    try {
      const twoFAAuth = await TwoFactorAuth.findOne({ userId }).select('+backupCodes');

      if (!twoFAAuth || !twoFAAuth.enabled) {
        throw new Error('2FA not enabled');
      }

      if (twoFAAuth.isLocked()) {
        throw new Error('Too many failed attempts. Please try again later.');
      }

      const used = twoFAAuth.useBackupCode(backupCode.toUpperCase());

      if (!used) {
        twoFAAuth.incrementFailedAttempts();
        await twoFAAuth.save();
        throw new Error('Invalid backup code');
      }

      twoFAAuth.resetFailedAttempts();
      twoFAAuth.lastUsedAt = new Date();
      await twoFAAuth.save();

      // Log backup code usage
      await AuditLog.create({
        userId,
        action: '2FA_BACKUP_CODE_USED',
        actionType: 'security',
        resourceType: 'TwoFactorAuth'
      });

      return true;
    } catch (error) {
      console.error('Error verifying backup code:', error);
      throw error;
    }
  }

  /**
   * Disable 2FA
   * @param {string} userId - User ID
   * @param {string} password - User password for confirmation
   * @returns {Promise<{success: boolean}>}
   */
  async disableTwoFactorAuth(userId, password) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Verify password
      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        throw new Error('Invalid password');
      }

      const twoFAAuth = await TwoFactorAuth.findOne({ userId });
      if (!twoFAAuth) {
        throw new Error('2FA not configured');
      }

      twoFAAuth.enabled = false;
      twoFAAuth.totpSecret = null;
      twoFAAuth.backupCodes = [];
      await twoFAAuth.save();

      // Log the action
      await AuditLog.create({
        userId,
        action: '2FA_DISABLED',
        actionType: 'security',
        resourceType: 'TwoFactorAuth'
      });

      // Send notification email
      await emailService.sendEmail({
        to: user.email,
        subject: 'Two-Factor Authentication Disabled',
        template: '2fa-disabled',
        data: {
          userName: user.name,
          timestamp: new Date().toISOString()
        }
      });

      return { success: true, message: '2FA has been disabled' };
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      throw error;
    }
  }

  /**
   * Regenerate backup codes
   * @param {string} userId - User ID
   * @returns {Promise<string[]>}
   */
  async regenerateBackupCodes(userId) {
    try {
      const twoFAAuth = await TwoFactorAuth.findOne({ userId });
      if (!twoFAAuth || !twoFAAuth.enabled) {
        throw new Error('2FA not enabled');
      }

      const newCodes = twoFAAuth.generateBackupCodes(10);
      await twoFAAuth.save();

      // Log the action
      await AuditLog.create({
        userId,
        action: '2FA_BACKUP_CODES_REGENERATED',
        actionType: 'security',
        resourceType: 'TwoFactorAuth'
      });

      return newCodes;
    } catch (error) {
      console.error('Error regenerating backup codes:', error);
      throw error;
    }
  }

  /**
   * Switch 2FA method
   * @param {string} userId - User ID
   * @param {string} newMethod - New method (totp, sms, email, backup-codes)
   * @returns {Promise<{success: boolean}>}
   */
  async switchTwoFactorMethod(userId, newMethod) {
    try {
      if (!['totp', 'sms', 'email', 'backup-codes'].includes(newMethod)) {
        throw new Error('Invalid 2FA method');
      }

      const twoFAAuth = await TwoFactorAuth.findOne({ userId });
      if (!twoFAAuth || !twoFAAuth.enabled) {
        throw new Error('2FA not enabled');
      }

      const oldMethod = twoFAAuth.method;
      twoFAAuth.method = newMethod;
      twoFAAuth.recordMethodHistory('switched', newMethod, null, null);
      await twoFAAuth.save();

      // Log the action
      await AuditLog.create({
        userId,
        action: '2FA_METHOD_SWITCHED',
        actionType: 'security',
        resourceType: 'TwoFactorAuth',
        details: {
          oldMethod,
          newMethod
        }
      });

      return { success: true, message: `2FA method switched to ${newMethod}` };
    } catch (error) {
      console.error('Error switching 2FA method:', error);
      throw error;
    }
  }

  /**
   * Add trusted device
   * @param {string} userId - User ID
   * @param {object} deviceInfo - Device info (fingerprint, name, type, os, browser, ipAddress, location)
   * @param {string} method - Verification method (email, sms, manual)
   * @returns {Promise<{deviceId: string, verificationCode?: string}>}
   */
  async addTrustedDevice(userId, deviceInfo, method = 'email') {
    try {
      const deviceId = crypto.randomBytes(16).toString('hex');

      const device = new TrustedDevice({
        userId,
        deviceId,
        fingerprint: deviceInfo.fingerprint,
        deviceName: deviceInfo.name || 'Unknown Device',
        deviceType: deviceInfo.type || 'unknown',
        os: deviceInfo.os || 'Unknown',
        browser: deviceInfo.browser || 'Unknown',
        ipAddress: deviceInfo.ipAddress,
        location: deviceInfo.location,
        verificationMethod: method
      });

      device.generateVerificationCode();
      await device.save();

      // Log the action
      await AuditLog.create({
        userId,
        action: 'TRUSTED_DEVICE_ADDED',
        actionType: 'security',
        resourceType: 'TrustedDevice',
        details: {
          deviceName: deviceInfo.name,
          method
        }
      });

      return {
        deviceId,
        verificationCode: device.verificationCode
      };
    } catch (error) {
      console.error('Error adding trusted device:', error);
      throw error;
    }
  }

  /**
   * Verify trusted device
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @param {string} verificationCode - Verification code
   * @returns {Promise<{success: boolean}>}
   */
  async verifyTrustedDevice(userId, deviceId, verificationCode) {
    try {
      const device = await TrustedDevice.findOne({ userId, deviceId }).select('+verificationCode');

      if (!device) {
        throw new Error('Device not found');
      }

      if (!device.verificationCode || device.verificationCode !== verificationCode) {
        throw new Error('Invalid verification code');
      }

      if (device.verificationCodeExpires < new Date()) {
        throw new Error('Verification code has expired');
      }

      device.isVerified = true;
      device.verificationCode = null;
      device.verificationCodeExpires = null;
      device.trustExpiresAt = new Date(Date.now() + device.trustDuration * 24 * 60 * 60 * 1000);
      await device.save();

      // Log the action
      await AuditLog.create({
        userId,
        action: 'TRUSTED_DEVICE_VERIFIED',
        actionType: 'security',
        resourceType: 'TrustedDevice',
        details: {
          deviceName: device.deviceName
        }
      });

      return { success: true, message: 'Device verified and trusted' };
    } catch (error) {
      console.error('Error verifying trusted device:', error);
      throw error;
    }
  }

  /**
   * Get all trusted devices for user
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  async getTrustedDevices(userId) {
    try {
      const devices = await TrustedDevice.find({ userId, isActive: true })
        .select('-fingerprint -verificationCode');

      return devices.map(device => ({
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        os: device.os,
        browser: device.browser,
        ipAddress: device.ipAddress,
        location: device.location,
        isVerified: device.isVerified,
        firstUsedAt: device.firstUsedAt,
        lastUsedAt: device.lastUsedAt,
        loginCount: device.loginCount,
        trustExpiresAt: device.trustExpiresAt,
        isCompromised: device.isCompromised,
        userLabel: device.userLabel
      }));
    } catch (error) {
      console.error('Error getting trusted devices:', error);
      throw error;
    }
  }

  /**
   * Remove trusted device
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<{success: boolean}>}
   */
  async removeTrustedDevice(userId, deviceId) {
    try {
      const device = await TrustedDevice.findOne({ userId, deviceId });

      if (!device) {
        throw new Error('Device not found');
      }

      device.isActive = false;
      await device.save();

      // Log the action
      await AuditLog.create({
        userId,
        action: 'TRUSTED_DEVICE_REMOVED',
        actionType: 'security',
        resourceType: 'TrustedDevice',
        details: {
          deviceName: device.deviceName
        }
      });

      return { success: true, message: 'Device removed' };
    } catch (error) {
      console.error('Error removing trusted device:', error);
      throw error;
    }
  }

  /**
   * Check if device should skip 2FA
   * @param {string} userId - User ID
   * @param {string} fingerprint - Device fingerprint
   * @returns {Promise<boolean>}
   */
  async shouldSkip2FA(userId, fingerprint) {
    try {
      const device = await TrustedDevice.findOne({
        userId,
        fingerprint,
        isVerified: true,
        isActive: true
      });

      if (!device) return false;
      if (device.isTrustExpired()) return false;

      return true;
    } catch (error) {
      console.error('Error checking 2FA skip:', error);
      return false;
    }
  }

  /**
   * Get 2FA status
   * @param {string} userId - User ID
   * @returns {Promise<object>}
   */
  async get2FAStatus(userId) {
    try {
      const twoFAAuth = await TwoFactorAuth.findOne({ userId });

      if (!twoFAAuth) {
        return {
          enabled: false,
          method: null,
          enrolledAt: null,
          lastUsedAt: null
        };
      }

      const backupCodesCount = twoFAAuth.getUnusedBackupCodesCount();
      const trustedDevices = await TrustedDevice.countDocuments({
        userId,
        isVerified: true,
        isActive: true
      });

      return {
        enabled: twoFAAuth.enabled,
        method: twoFAAuth.method,
        enrolledAt: twoFAAuth.enrolledAt,
        enrollmentCompletedAt: twoFAAuth.enrollmentCompletedAt,
        lastUsedAt: twoFAAuth.lastUsedAt,
        backupCodesRemaining: backupCodesCount,
        trustedDevicesCount: trustedDevices,
        requireForSensitiveActions: twoFAAuth.requireForSensitiveActions,
        methodHistory: twoFAAuth.methodHistory
      };
    } catch (error) {
      console.error('Error getting 2FA status:', error);
      throw error;
    }
  }

  /**
   * Send 2FA code via email
   * @param {string} userId - User ID
   * @param {string} email - Email address
   * @returns {Promise<{success: boolean}>}
   */
  async send2FACodeEmail(userId, email) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate one-time password
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      const twoFAAuth = await TwoFactorAuth.findOne({ userId });
      if (!twoFAAuth) {
        throw new Error('2FA not configured');
      }

      twoFAAuth.oneTimePasswords.push({
        password: otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });
      await twoFAAuth.save();

      // Send email
      await emailService.sendEmail({
        to: email,
        subject: 'Your ExpenseFlow 2FA Code',
        template: '2fa-code',
        data: {
          userName: user.name,
          code: otp,
          expiresIn: '10 minutes'
        }
      });

      return { success: true, message: '2FA code sent to email' };
    } catch (error) {
      console.error('Error sending 2FA code:', error);
      throw error;
    }
  }

  /**
   * Verify 2FA code sent via email
   * @param {string} userId - User ID
   * @param {string} code - OTP code
   * @returns {Promise<boolean>}
   */
  async verify2FACodeEmail(userId, code) {
    try {
      const twoFAAuth = await TwoFactorAuth.findOne({ userId });
      if (!twoFAAuth) {
        throw new Error('2FA not configured');
      }

      const otp = twoFAAuth.oneTimePasswords.find(
        op => op.password === code && op.expiresAt > new Date() && !op.used
      );

      if (!otp) {
        throw new Error('Invalid or expired code');
      }

      otp.used = true;
      otp.usedAt = new Date();
      twoFAAuth.lastUsedAt = new Date();
      await twoFAAuth.save();

      return true;
    } catch (error) {
      console.error('Error verifying 2FA code:', error);
      throw error;
    }
  }

  /**
   * Validate session after successful 2FA verification
   * Issue #504: Session validation after 2FA
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @param {object} loginInfo - Login information (ipAddress, userAgent, deviceFingerprint)
   * @returns {Promise<boolean>}
   */
  async validateSessionAfter2FA(userId, sessionId, loginInfo) {
    try {
      // Use suspicious login detection service to validate
      const isValid = await suspiciousLoginDetectionService.validateSessionAfter2FA(
        userId,
        sessionId,
        loginInfo
      );

      return isValid;
    } catch (error) {
      console.error('Error validating session after 2FA:', error);
      throw error;
    }
  }

  /**
   * Enforce backup code one-time use
   * Issue #504: Backup code one-time use
   * @param {string} userId - User ID
   * @param {string} backupCode - Backup code to verify
   * @returns {Promise<boolean>}
   */
  async verifyBackupCodeWithOneTimeUse(userId, backupCode) {
    try {
      // First validate that code hasn't been used recently
      await suspiciousLoginDetectionService.validateBackupCodeOneTimeUse(userId, backupCode);

      // Then verify the actual backup code
      return await this.verifyBackupCode(userId, backupCode);
    } catch (error) {
      console.error('Error verifying backup code with one-time use enforcement:', error);
      throw error;
    }
  }

  /**
   * Check for suspicious login patterns
   * Issue #504: Suspicious login detection
   * @param {string} userId - User ID
   * @param {object} loginInfo - Login information
   * @returns {Promise<{isSuspicious: boolean, riskScore: number, flags: []}>}
   */
  async checkSuspiciousLogin(userId, loginInfo) {
    try {
      return await suspiciousLoginDetectionService.analyzeLoginAttempt(userId, loginInfo);
    } catch (error) {
      console.error('Error checking suspicious login:', error);
      throw error;
    }
  }

  /**
   * Check for brute force attempts
   * Issue #504: Brute force detection
   * @param {string} userId - User ID
   * @param {string} ipAddress - IP address
   * @returns {Promise<{isBruteForce: boolean, attemptCount: number}>}
   */
  async checkBruteForceAttempt(userId, ipAddress) {
    try {
      return await suspiciousLoginDetectionService.checkBruteForcePattern(userId, ipAddress);
    } catch (error) {
      console.error('Error checking brute force attempt:', error);
      return { isBruteForce: false, attemptCount: 0 };
    }
  }

  /**
   * Get user's risk profile
   * Issue #504: Security monitoring
   * @param {string} userId - User ID
   * @param {number} hours - Time window to analyze (default: 24)
   * @returns {Promise<object>}
   */
  async getUserSecurityProfile(userId, hours = 24) {
    try {
      return await suspiciousLoginDetectionService.getUserRiskProfile(userId, hours);
    } catch (error) {
      console.error('Error getting user security profile:', error);
      throw error;
    }
  }

  /**
   * Log 2FA attempt with security context
   * Issue #504: Security event logging
   * @param {string} userId - User ID
   * @param {string} eventType - Event type
   * @param {object} details - Event details
   * @returns {Promise<void>}
   */
  async log2FASecurityEvent(userId, eventType, details = {}) {
    try {
      await SecurityEvent.logEvent({
        userId,
        eventType: eventType.includes('SUCCESS') ? '2FA_SUCCESS' :
                   eventType.includes('FAILURE') ? '2FA_FAILURE' :
                   eventType.includes('BACKUP') ? 'BACKUP_CODE_ATTEMPT' : '2FA_ATTEMPT',
        severity: details.severity || 'medium',
        source: '2fa_verification',
        ipAddress: details.ipAddress,
        userAgent: details.userAgent,
        deviceFingerprint: details.deviceFingerprint,
        location: details.location,
        details,
        riskScore: details.riskScore || 0
      });
    } catch (error) {
      console.error('Error logging 2FA security event:', error);
    }
  }

  /**
   * Send SMS code for 2FA setup
   * @param {string} userId - User ID
   * @param {string} phoneNumber - Phone number to send SMS to
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async sendSMSCode(userId, phoneNumber) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate phone number format
      const phoneRegex = /^\+?1?\d{9,15}$/;
      if (!phoneRegex.test(phoneNumber.replace(/[^\d+]/g, ''))) {
        throw new Error('Invalid phone number format');
      }

      // Generate 6-digit SMS code
      const smsCode = Math.floor(100000 + Math.random() * 900000).toString();

      const twoFAAuth = await TwoFactorAuth.findOne({ userId });
      if (!twoFAAuth) {
        throw new Error('2FA not configured');
      }

      // Store SMS code temporarily
      twoFAAuth.oneTimePasswords.push({
        password: smsCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });

      twoFAAuth.phoneNumber = phoneNumber;
      await twoFAAuth.save();

      // Send SMS via third-party service (Twillio, AWS SNS, etc.)
      // For now, we'll log it. In production, integrate with SMS provider
      await this._sendSMSViaProvider(phoneNumber, `Your ExpenseFlow 2FA code is: ${smsCode}. Valid for 10 minutes.`);

      return { 
        success: true, 
        message: 'SMS code sent successfully' 
      };
    } catch (error) {
      console.error('Error sending SMS code:', error);
      throw error;
    }
  }

  /**
   * Verify SMS code and enable SMS 2FA
   * @param {string} userId - User ID
   * @param {string} phoneNumber - Phone number
   * @param {string} code - SMS code
   * @returns {Promise<{success: boolean, backupCodes?: string[]}>}
   */
  async verifyAndEnableSMS(userId, phoneNumber, code) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const twoFAAuth = await TwoFactorAuth.findOne({ userId });
      if (!twoFAAuth) {
        throw new Error('2FA not configured');
      }

      // Check if account is locked
      if (twoFAAuth.isLocked()) {
        throw new Error('Too many failed attempts. Please try again later.');
      }

      // Verify the code
      const otp = twoFAAuth.oneTimePasswords.find(
        op => op.password === code && op.expiresAt > new Date() && !op.used
      );

      if (!otp) {
        twoFAAuth.incrementFailedAttempts();
        await twoFAAuth.save();
        throw new Error('Invalid or expired SMS code');
      }

      // Mark code as used
      otp.used = true;
      otp.usedAt = new Date();

      // Enable SMS 2FA
      twoFAAuth.phoneNumber = phoneNumber;
      twoFAAuth.phoneVerified = true;
      twoFAAuth.phoneVerificationCode = null;
      twoFAAuth.phoneVerificationExpires = null;
      twoFAAuth.enabled = true;
      twoFAAuth.method = 'sms';
      twoFAAuth.enrolledAt = new Date();
      twoFAAuth.enrollmentCompletedAt = new Date();

      // Generate backup codes
      const backupCodes = twoFAAuth.generateBackupCodes(10);

      // Clear setup fields
      twoFAAuth.setupSecretExpires = null;
      twoFAAuth.setupAttempts = 0;
      twoFAAuth.resetFailedAttempts();

      await twoFAAuth.save();

      // Log the action
      await AuditLog.create({
        userId,
        action: '2FA_ENABLED',
        actionType: 'security',
        resourceType: 'TwoFactorAuth',
        details: {
          method: 'sms',
          phoneNumber: this._maskPhoneNumber(phoneNumber),
          backupCodesGenerated: backupCodes.length
        }
      });

      return {
        success: true,
        backupCodes: backupCodes,
        message: 'SMS two-factor authentication enabled successfully'
      };
    } catch (error) {
      console.error('Error verifying SMS setup:', error);
      throw error;
    }
  }

  /**
   * Verify SMS code during login
   * @param {string} userId - User ID
   * @param {string} code - SMS code
   * @returns {Promise<boolean>}
   */
  async verifySMSCode(userId, code) {
    try {
      const twoFAAuth = await TwoFactorAuth.findOne({ userId });

      if (!twoFAAuth || !twoFAAuth.enabled || twoFAAuth.method !== 'sms') {
        throw new Error('SMS 2FA not enabled for this user');
      }

      // Check if account is locked
      if (twoFAAuth.isLocked()) {
        throw new Error('Too many failed attempts. Please try again later.');
      }

      // Find valid code
      const otp = twoFAAuth.oneTimePasswords.find(
        op => op.password === code && op.expiresAt > new Date() && !op.used
      );

      if (!otp) {
        twoFAAuth.incrementFailedAttempts();
        await twoFAAuth.save();
        throw new Error('Invalid or expired SMS code');
      }

      // Mark code as used
      otp.used = true;
      otp.usedAt = new Date();

      // Reset failed attempts on successful verification
      twoFAAuth.resetFailedAttempts();
      twoFAAuth.lastUsedAt = new Date();
      await twoFAAuth.save();

      return true;
    } catch (error) {
      console.error('Error verifying SMS code:', error);
      throw error;
    }
  }

  /**
   * Setup email as 2FA method
   * @param {string} userId - User ID
   * @param {string} recoveryEmail - Recovery email for 2FA
   * @returns {Promise<{success: boolean}>}
   */
  async setupEmailMethod(userId, recoveryEmail) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(recoveryEmail)) {
        throw new Error('Invalid email format');
      }

      const twoFAAuth = await TwoFactorAuth.findOne({ userId });
      if (!twoFAAuth) {
        throw new Error('2FA not configured');
      }

      // Generate verification code for email
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

      twoFAAuth.recoveryEmail = recoveryEmail;
      twoFAAuth.recoveryEmailVerificationCode = verificationCode;
      twoFAAuth.recoveryEmailVerificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await twoFAAuth.save();

      // Send verification code to email
      await emailService.sendEmail({
        to: recoveryEmail,
        subject: 'Verify Your ExpenseFlow Recovery Email',
        template: 'email-2fa-verification',
        data: {
          userName: user.name,
          code: verificationCode,
          expiresIn: '15 minutes'
        }
      });

      return { 
        success: true, 
        message: 'Verification code sent to email' 
      };
    } catch (error) {
      console.error('Error setting up email method:', error);
      throw error;
    }
  }

  /**
   * Verify email and enable email 2FA method
   * @param {string} userId - User ID
   * @param {string} verificationCode - Code sent to email
   * @returns {Promise<{success: boolean, backupCodes?: string[]}>}
   */
  async verifyAndEnableEmail(userId, verificationCode) {
    try {
      const twoFAAuth = await TwoFactorAuth.findOne({ userId }).select('+recoveryEmailVerificationCode');

      if (!twoFAAuth) {
        throw new Error('2FA not configured');
      }

      if (!twoFAAuth.recoveryEmail) {
        throw new Error('Recovery email not set');
      }

      if (twoFAAuth.recoveryEmailVerificationExpires < new Date()) {
        throw new Error('Verification code has expired. Please request a new one.');
      }

      // Check if account is locked
      if (twoFAAuth.isLocked()) {
        throw new Error('Too many failed attempts. Please try again later.');
      }

      // Verify code
      if (twoFAAuth.recoveryEmailVerificationCode !== verificationCode) {
        twoFAAuth.incrementFailedAttempts();
        await twoFAAuth.save();
        throw new Error('Invalid verification code');
      }

      // Enable email 2FA
      twoFAAuth.recoveryEmailVerified = true;
      twoFAAuth.recoveryEmailVerificationCode = null;
      twoFAAuth.recoveryEmailVerificationExpires = null;
      twoFAAuth.enabled = true;
      twoFAAuth.method = 'email';
      twoFAAuth.enrolledAt = new Date();
      twoFAAuth.enrollmentCompletedAt = new Date();

      // Generate backup codes
      const backupCodes = twoFAAuth.generateBackupCodes(10);

      twoFAAuth.resetFailedAttempts();
      await twoFAAuth.save();

      // Log the action
      await AuditLog.create({
        userId,
        action: '2FA_ENABLED',
        actionType: 'security',
        resourceType: 'TwoFactorAuth',
        details: {
          method: 'email',
          email: twoFAAuth.recoveryEmail,
          backupCodesGenerated: backupCodes.length
        }
      });

      return {
        success: true,
        backupCodes: backupCodes,
        message: 'Email two-factor authentication enabled successfully'
      };
    } catch (error) {
      console.error('Error verifying email setup:', error);
      throw error;
    }
  }

  /**
   * Verify email code during login
   * @param {string} userId - User ID
   * @param {string} code - Email code
   * @returns {Promise<boolean>}
   */
  async verifyEmailCode(userId, code) {
    try {
      const twoFAAuth = await TwoFactorAuth.findOne({ userId });

      if (!twoFAAuth || !twoFAAuth.enabled || twoFAAuth.method !== 'email') {
        throw new Error('Email 2FA not enabled for this user');
      }

      // Check if account is locked
      if (twoFAAuth.isLocked()) {
        throw new Error('Too many failed attempts. Please try again later.');
      }

      // Find valid code
      const otp = twoFAAuth.oneTimePasswords.find(
        op => op.password === code && op.expiresAt > new Date() && !op.used
      );

      if (!otp) {
        twoFAAuth.incrementFailedAttempts();
        await twoFAAuth.save();
        throw new Error('Invalid or expired email code');
      }

      // Mark code as used
      otp.used = true;
      otp.usedAt = new Date();

      // Reset failed attempts on successful verification
      twoFAAuth.resetFailedAttempts();
      twoFAAuth.lastUsedAt = new Date();
      await twoFAAuth.save();

      return true;
    } catch (error) {
      console.error('Error verifying email code:', error);
      throw error;
    }
  }

  /**
   * Helper function to send SMS via provider
   * @private
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - SMS message
   */
  async _sendSMSViaProvider(phoneNumber, message) {
    try {
      // TODO: Integrate with actual SMS provider (Twilio, AWS SNS, etc.)
      // Example with Twilio:
      // const twilio = require('twilio');
      // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      // await client.messages.create({
      //   body: message,
      //   from: process.env.TWILIO_PHONE_NUMBER,
      //   to: phoneNumber
      // });

      console.log(`SMS sent to ${phoneNumber}: ${message}`);
      return true;
    } catch (error) {
      console.error('Error sending SMS via provider:', error);
      throw new Error('Failed to send SMS. Please try again later.');
    }
  }

  /**
   * Helper function to mask phone number
   * @private
   * @param {string} phoneNumber - Phone number to mask
   * @returns {string} Masked phone number
   */
  _maskPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/[^\d]/g, '');
    const lastFour = cleaned.slice(-4);
    return `***-***-${lastFour}`;
  }
}

module.exports = new TwoFactorAuthService();
