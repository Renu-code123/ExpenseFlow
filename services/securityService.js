const crypto = require('crypto');
const QRCode = require('qrcode');
const User = require('../models/User');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');

/**
 * Security Service - TOTP 2FA Implementation
 * Issue #338: Enterprise-Grade Audit Trail & TOTP Security Suite
 * 
 * Implements RFC 6238 TOTP (Time-based One-Time Password)
 * Compatible with Google Authenticator, Authy, Microsoft Authenticator, etc.
 */

const TOTP_CONFIG = {
  issuer: 'ExpenseFlow',
  algorithm: 'SHA1',
  digits: 6,
  period: 30, // seconds
  window: 1   // Allow 1 period before/after for clock drift
};

class SecurityService {
  /**
   * Generate a new TOTP secret for a user
   */
  static generateSecret() {
    // Generate a 20-byte (160-bit) secret as per RFC 4226
    const buffer = crypto.randomBytes(20);
    // Encode in base32 (required by most authenticator apps)
    return base32Encode(buffer);
  }

  /**
   * Generate a TOTP code from a secret
   */
  static generateTOTP(secret, timestamp = Date.now()) {
    const counter = Math.floor(timestamp / 1000 / TOTP_CONFIG.period);
    return this.generateHOTP(secret, counter);
  }

  /**
   * Generate HOTP (HMAC-based One-Time Password)
   */
  static generateHOTP(secret, counter) {
    // Decode base32 secret
    const key = base32Decode(secret);

    // Convert counter to 8-byte buffer (big-endian)
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));

    // Generate HMAC-SHA1
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(counterBuffer);
    const digest = hmac.digest();

    // Dynamic truncation
    const offset = digest[digest.length - 1] & 0x0f;
    const code = (
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)
    ) % Math.pow(10, TOTP_CONFIG.digits);

    // Pad with leading zeros
    return code.toString().padStart(TOTP_CONFIG.digits, '0');
  }

  /**
   * Verify a TOTP code
   */
  static verifyTOTP(secret, token, timestamp = Date.now()) {
    // Check current and adjacent time windows for clock drift tolerance
    for (let i = -TOTP_CONFIG.window; i <= TOTP_CONFIG.window; i++) {
      const adjustedTime = timestamp + (i * TOTP_CONFIG.period * 1000);
      const expectedToken = this.generateTOTP(secret, adjustedTime);

      if (crypto.timingSafeEqual(
        Buffer.from(token.padStart(6, '0')),
        Buffer.from(expectedToken)
      )) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generate QR code URL for authenticator apps
   */
  static generateOTPAuthURL(email, secret) {
    const encodedIssuer = encodeURIComponent(TOTP_CONFIG.issuer);
    const encodedEmail = encodeURIComponent(email);

    return `otpauth://totp/${encodedIssuer}:${encodedEmail}?` +
      `secret=${secret}&` +
      `issuer=${encodedIssuer}&` +
      `algorithm=${TOTP_CONFIG.algorithm}&` +
      `digits=${TOTP_CONFIG.digits}&` +
      `period=${TOTP_CONFIG.period}`;
  }

  /**
   * Generate QR code as data URL
   */
  static async generateQRCode(otpAuthURL) {
    try {
      return await QRCode.toDataURL(otpAuthURL, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      console.error('QR Code generation error:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Setup 2FA for a user - Step 1: Generate secret and QR code
   */
  static async setup2FA(userId) {
    const user = await User.findById(userId).select('+twoFactorAuth.secret +twoFactorAuth.tempSecret');

    if (!user) {
      throw new Error('User not found');
    }

    if (user.twoFactorAuth?.enabled) {
      throw new Error('2FA is already enabled');
    }

    // Generate new secret
    const secret = this.generateSecret();

    // Store as temporary secret until verified
    user.twoFactorAuth = user.twoFactorAuth || {};
    user.twoFactorAuth.tempSecret = secret;
    await user.save();

    // Generate QR code
    const otpAuthURL = this.generateOTPAuthURL(user.email, secret);
    const qrCode = await this.generateQRCode(otpAuthURL);

    return {
      secret,
      qrCode,
      otpAuthURL,
      manualEntry: {
        account: user.email,
        key: formatSecretForDisplay(secret),
        issuer: TOTP_CONFIG.issuer,
        type: 'TOTP',
        digits: TOTP_CONFIG.digits,
        period: TOTP_CONFIG.period
      }
    };
  }

  /**
   * Verify 2FA setup - Step 2: Confirm with a valid token
   */
  static async verify2FASetup(userId, token, req) {
    const user = await User.findById(userId).select('+twoFactorAuth.secret +twoFactorAuth.tempSecret');

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.twoFactorAuth?.tempSecret) {
      throw new Error('2FA setup not initiated');
    }

    // Verify the token against temp secret
    const isValid = this.verifyTOTP(user.twoFactorAuth.tempSecret, token);

    if (!isValid) {
      // Log failed attempt
      await AuditLog.logAuthEvent(userId, 'totp_failed', req, {
        severity: 'medium',
        status: 'failure',
        securityContext: { totpUsed: true }
      });
      throw new Error('Invalid verification code');
    }

    // Move temp secret to permanent, generate backup codes
    user.twoFactorAuth.secret = user.twoFactorAuth.tempSecret;
    user.twoFactorAuth.tempSecret = undefined;
    user.twoFactorAuth.enabled = true;
    user.twoFactorAuth.enabledAt = new Date();
    user.twoFactorAuth.lastVerifiedAt = new Date();

    // Generate backup codes
    const backupCodes = user.generateBackupCodes();
    await user.save();

    // Log successful 2FA enablement
    await AuditLog.logAuthEvent(userId, 'totp_enabled', req, {
      severity: 'high',
      status: 'success',
      securityContext: { totpUsed: true }
    });

    return {
      success: true,
      backupCodes,
      message: '2FA has been enabled successfully'
    };
  }

  /**
   * Verify a TOTP token for authentication
   */
  static async verifyToken(userId, token, req) {
    const user = await User.findById(userId).select('+twoFactorAuth.secret +twoFactorAuth.backupCodes');

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.twoFactorAuth?.enabled) {
      throw new Error('2FA is not enabled');
    }

    // First, try TOTP verification
    if (this.verifyTOTP(user.twoFactorAuth.secret, token)) {
      user.twoFactorAuth.lastVerifiedAt = new Date();
      await user.save();

      await AuditLog.logAuthEvent(userId, 'totp_verified', req, {
        severity: 'low',
        status: 'success',
        securityContext: { totpUsed: true }
      });

      return { valid: true, method: 'totp' };
    }

    // Try backup code
    const backupUsed = await user.useBackupCode(token);
    if (backupUsed) {
      await AuditLog.logAuthEvent(userId, 'totp_backup_used', req, {
        severity: 'high',
        status: 'success',
        securityContext: {
          totpUsed: true,
          riskFactors: ['backup_code_used']
        }
      });

      return {
        valid: true,
        method: 'backup',
        remainingBackupCodes: user.getRemainingBackupCodes()
      };
    }

    // Log failed verification
    await AuditLog.logAuthEvent(userId, 'totp_failed', req, {
      severity: 'medium',
      status: 'failure',
      securityContext: { totpUsed: true }
    });

    return { valid: false };
  }

  /**
   * Disable 2FA for a user
   */
  static async disable2FA(userId, password, req) {
    const user = await User.findById(userId).select('+twoFactorAuth.secret');

    if (!user) {
      throw new Error('User not found');
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      throw new Error('Invalid password');
    }

    if (!user.twoFactorAuth?.enabled) {
      throw new Error('2FA is not enabled');
    }

    // Clear 2FA settings
    user.twoFactorAuth.enabled = false;
    user.twoFactorAuth.secret = undefined;
    user.twoFactorAuth.tempSecret = undefined;
    user.twoFactorAuth.backupCodes = [];
    user.twoFactorAuth.enabledAt = undefined;
    await user.save();

    // Log 2FA disable
    await AuditLog.logAuthEvent(userId, 'totp_disabled', req, {
      severity: 'critical',
      status: 'success'
    });

    return { success: true, message: '2FA has been disabled' };
  }

  /**
   * Regenerate backup codes
   */
  static async regenerateBackupCodes(userId, token, req) {
    const user = await User.findById(userId).select('+twoFactorAuth.secret +twoFactorAuth.backupCodes');

    if (!user || !user.twoFactorAuth?.enabled) {
      throw new Error('2FA is not enabled');
    }

    // Verify current TOTP token
    const isValid = this.verifyTOTP(user.twoFactorAuth.secret, token);
    if (!isValid) {
      throw new Error('Invalid verification code');
    }

    // Generate new backup codes
    const backupCodes = user.generateBackupCodes();
    await user.save();

    // Log backup code regeneration
    await AuditLog.logAuthEvent(userId, 'backup_codes_regenerated', req, {
      severity: 'high',
      status: 'success'
    });

    return { backupCodes };
  }

  /**
   * Get 2FA status for a user
   */
  static async get2FAStatus(userId) {
    const user = await User.findById(userId).select('twoFactorAuth.enabled twoFactorAuth.enabledAt twoFactorAuth.lastVerifiedAt twoFactorAuth.backupCodes');

    if (!user) {
      throw new Error('User not found');
    }

    return {
      enabled: user.twoFactorAuth?.enabled || false,
      enabledAt: user.twoFactorAuth?.enabledAt,
      lastVerifiedAt: user.twoFactorAuth?.lastVerifiedAt,
      remainingBackupCodes: user.twoFactorAuth?.backupCodes?.filter(c => !c.used).length || 0
    };
  }

  // ========================
  // Session Management
  // ========================

  /**
   * Get all active sessions for a user
   */
  static async getActiveSessions(userId) {
    return Session.getActiveSessions(userId);
  }

  /**
   * Get login history for a user
   */
  static async getLoginHistory(userId, limit = 20) {
    return Session.getLoginHistory(userId, limit);
  }

  /**
   * Revoke a specific session
   */
  static async revokeSession(sessionId, userId, req) {
    const session = await Session.findOne({ _id: sessionId, userId });

    if (!session) {
      throw new Error('Session not found');
    }

    await Session.revokeSession(sessionId, userId, 'user_request');

    // Log session revocation
    await AuditLog.logAuthEvent(userId, 'session_revoked', req, {
      severity: 'medium',
      status: 'success'
    });

    return { success: true, message: 'Session revoked successfully' };
  }

  /**
   * Revoke all sessions except current
   */
  static async revokeAllSessions(userId, currentSessionId, req) {
    const revokedCount = await Session.revokeAllUserSessions(userId, userId, 'user_request', currentSessionId);

    // Log all sessions revoked
    await AuditLog.logAuthEvent(userId, 'all_sessions_revoked', req, {
      severity: 'high',
      status: 'success',
      securityContext: {
        riskFactors: [`${revokedCount} sessions revoked`]
      }
    });

    return {
      success: true,
      revokedCount,
      message: `${revokedCount} session(s) revoked successfully`
    };
  }

  // ========================
  // Audit Trail
  // ========================

  /**
   * Get security audit trail for a user
   */
  static async getSecurityAuditTrail(userId, options = {}) {
    const { days = 30, limit = 100, actions } = options;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const query = {
      userId,
      createdAt: { $gte: startDate }
    };

    if (actions && actions.length > 0) {
      query.action = { $in: actions };
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return logs.map(log => ({
      id: log._id,
      action: log.action,
      description: getActionDescription(log.action),
      severity: log.severity,
      status: log.status,
      timestamp: log.createdAt,
      ipAddress: log.metadata?.ipAddress,
      device: log.metadata?.device,
      location: log.metadata?.geoLocation
    }));
  }

  static async getLoginHistoryFromAudit(userId, limit = 50) {
    const logs = await AuditLog.find({
      performedBy: userId,
      action: { $in: ['user_login', 'login_failed', 'totp_verified', 'totp_failed'] }
    })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return logs;
  }

  /**
   * Forensic Pattern Detection
   * Issue #731: Identifies high-risk mutation patterns (e.g. mass deletion).
   */
  static async detectSuspiciousPatterns(userId) {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const massActions = await AuditLog.aggregate([
      {
        $match: {
          performedBy: userId,
          action: { $in: ['delete', 'update'] },
          timestamp: { $gt: tenMinutesAgo }
        }
      },
      {
        $group: {
          _id: "$action",
          count: { $sum: 1 }
        }
      }
    ]);

    const alerts = [];
    for (const action of massActions) {
      if (action._id === 'delete' && action.count > 50) {
        alerts.push({
          type: 'MASS_DELETION',
          severity: 'critical',
          message: `Detected ${action.count} deletions in 10 minutes.`
        });
      }
      if (action._id === 'update' && action.count > 100) {
        alerts.push({
          type: 'RAPID_MUTATION',
          severity: 'high',
          message: `Detected ${action.count} updates in 10 minutes.`
        });
      }
    }

    return alerts;
  }
}

// ========================
// Helper Functions
// ========================

/**
 * Base32 encoding (RFC 4648)
 */
function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Base32 decoding
 */
function base32Decode(encoded) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanedInput = encoded.replace(/=+$/, '').toUpperCase();

  let bits = 0;
  let value = 0;
  const output = [];

  for (let i = 0; i < cleanedInput.length; i++) {
    const idx = alphabet.indexOf(cleanedInput[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Format secret for manual entry display
 */
function formatSecretForDisplay(secret) {
  return secret.match(/.{1,4}/g)?.join(' ') || secret;
}

/**
 * Get human-readable action description
 */
function getActionDescription(action) {
  const descriptions = {
    'user_login': 'Logged in successfully',
    'user_logout': 'Logged out',
    'user_register': 'Account created',
    'login_failed': 'Failed login attempt',
    'login_blocked': 'Login blocked due to security policy',
    'password_changed': 'Password changed',
    'password_reset_requested': 'Password reset requested',
    'password_reset_completed': 'Password reset completed',
    'totp_enabled': '2FA enabled',
    'totp_disabled': '2FA disabled',
    'totp_verified': '2FA verification successful',
    'totp_failed': '2FA verification failed',
    'totp_backup_used': 'Backup code used for 2FA',
    'backup_codes_generated': 'Backup codes generated',
    'backup_codes_regenerated': 'Backup codes regenerated',
    'session_created': 'New session started',
    'session_revoked': 'Session revoked',
    'session_expired': 'Session expired',
    'all_sessions_revoked': 'All sessions revoked',
    'suspicious_activity': 'Suspicious activity detected',
    'ip_blocked': 'IP address blocked',
    'rate_limit_exceeded': 'Rate limit exceeded',
    'account_locked': 'Account locked',
    'account_unlocked': 'Account unlocked',
    'profile_updated': 'Profile updated',
    'email_changed': 'Email address changed'
  };

  return descriptions[action] || action.replace(/_/g, ' ');
}

module.exports = SecurityService;
