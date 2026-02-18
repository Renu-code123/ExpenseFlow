const express = require('express');
const auth = require('../middleware/auth');
const {
  check2FARequired,
  verify2FA,
  requireSensitive2FA,
  trustDevice,
  validateDeviceTrust,
  log2FAEvent
} = require('../middleware/twoFactorAuthMiddleware');
const { validateRequest } = require('../middleware/inputValidator');
const { twoFactorLimiter, verifyCodeLimiter } = require('../middleware/rateLimiter');
const twoFactorAuthService = require('../services/twoFactorAuthService');
const accountTakeoverAlertingService = require('../services/accountTakeoverAlertingService');
const TwoFactorAuth = require('../models/TwoFactorAuth');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

/**
 * 2FA Routes
 * Issue #503: 2FA Management
 */

/**
 * GET /2fa/status
 * Get 2FA status for current user
 */
router.get('/status', auth, async (req, res) => {
  try {
    const status = await twoFactorAuthService.get2FAStatus(req.user.id);
    res.json(status);
  } catch (error) {
    console.error('Error getting 2FA status:', error);
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

/**
 * POST /2fa/setup/initiate
 * Initiate 2FA setup - generate TOTP secret and QR code
 */
router.post('/setup/initiate', auth, twoFactorLimiter, async (req, res) => {
  try {
    const result = await twoFactorAuthService.generateTOTPSecret(
      req.user.id,
      req.user.email
    );

    res.json({
      secret: result.secret,
      qrCode: result.qrCode,
      manualEntryKey: result.manualEntryKey,
      message: 'TOTP secret generated. Scan QR code with your authenticator app.'
    });
  } catch (error) {
    console.error('Error initiating 2FA setup:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate 2FA setup' });
  }
});

/**
 * POST /2fa/setup/verify
 * Verify TOTP code and enable 2FA
 */
router.post('/setup/verify', auth, verifyCodeLimiter, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid TOTP code format' });
    }

    const result = await twoFactorAuthService.verifyAndEnableTOTP(req.user.id, code);

    // Log the action
    await AuditLog.create({
      userId: req.user.id,
      action: '2FA_SETUP_COMPLETED',
      actionType: 'security',
      resourceType: 'TwoFactorAuth',
      details: {
        method: 'totp'
      }
    });

    // Trigger account takeover alert for 2FA enable
    try {
      await accountTakeoverAlertingService.alertTwoFAChange(
        req.user.id,
        {
          action: 'enabled',
          method: 'totp',
          ipAddress: req.ip,
          location: {
            city: req.body.location?.city,
            country: req.body.location?.country
          },
          userAgent: req.get('User-Agent'),
          timestamp: new Date()
        }
      );
    } catch (alertError) {
      console.error('Error sending 2FA change alert:', alertError);
    }

    res.json({
      success: true,
      backupCodes: result.backupCodes,
      message: result.message
    });
  } catch (error) {
    console.error('Error verifying 2FA setup:', error);
    res.status(400).json({ error: error.message || 'Failed to verify TOTP code' });
  }
});

/**
 * POST /2fa/verify
 * Verify 2FA code during login
 */
router.post('/verify', auth, verifyCodeLimiter, verify2FA, trustDevice, async (req, res) => {
  try {
    const response = {
      success: true,
      message: '2FA verification successful'
    };

    if (req.newTrustedDevice) {
      response.deviceAdded = true;
      response.deviceId = req.newTrustedDevice.deviceId;
      response.verificationCode = req.newTrustedDevice.verificationCode;
      response.message += '. Device added to trusted list.';
    }

    res.json(response);
  } catch (error) {
    console.error('Error verifying 2FA:', error);
    res.status(400).json({ error: error.message || 'Failed to verify 2FA code' });
  }
});

/**
 * POST /2fa/disable
 * Disable 2FA for current user
 */
router.post('/disable', auth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const result = await twoFactorAuthService.disableTwoFactorAuth(req.user.id, password);

    // Trigger account takeover alert for 2FA disable (CRITICAL)
    try {
      await accountTakeoverAlertingService.alertTwoFAChange(
        req.user.id,
        {
          action: 'disabled',
          method: null,
          ipAddress: req.ip,
          location: {
            city: req.body.location?.city,
            country: req.body.location?.country
          },
          userAgent: req.get('User-Agent'),
          timestamp: new Date()
        }
      );
    } catch (alertError) {
      console.error('Error sending 2FA disable alert:', alertError);
    }

    res.json(result);
  } catch (error) {
    console.error('Error disabling 2FA:', error);
    res.status(400).json({ error: error.message || 'Failed to disable 2FA' });
  }
});

/**
 * POST /2fa/backup-codes/regenerate
 * Regenerate backup codes
 */
router.post('/backup-codes/regenerate', auth, async (req, res) => {
  try {
    const codes = await twoFactorAuthService.regenerateBackupCodes(req.user.id);

    // Trigger account takeover alert for backup codes regeneration
    try {
      await accountTakeoverAlertingService.alertTwoFAChange(
        req.user.id,
        {
          action: 'backup_codes_regenerated',
          method: null,
          ipAddress: req.ip,
          location: {
            city: req.body.location?.city,
            country: req.body.location?.country
          },
          userAgent: req.get('User-Agent'),
          timestamp: new Date()
        }
      );
    } catch (alertError) {
      console.error('Error sending backup codes alert:', alertError);
    }

    res.json({
      success: true,
      backupCodes: codes,
      message: 'Backup codes regenerated successfully'
    });
  } catch (error) {
    console.error('Error regenerating backup codes:', error);
    res.status(400).json({ error: error.message || 'Failed to regenerate backup codes' });
  }
});

/**
 * POST /2fa/method/switch
 * Switch 2FA method
 */
router.post('/method/switch', auth, async (req, res) => {
  try {
    const { method } = req.body;

    if (!method) {
      return res.status(400).json({ error: 'Method is required' });
    }

    const result = await twoFactorAuthService.switchTwoFactorMethod(req.user.id, method);

    // Trigger account takeover alert for method change
    try {
      await accountTakeoverAlertingService.alertTwoFAChange(
        req.user.id,
        {
          action: 'method_changed',
          method: method,
          ipAddress: req.ip,
          location: {
            city: req.body.location?.city,
            country: req.body.location?.country
          },
          userAgent: req.get('User-Agent'),
          timestamp: new Date()
        }
      );
    } catch (alertError) {
      console.error('Error sending 2FA method change alert:', alertError);
    }

    res.json(result);
  } catch (error) {
    console.error('Error switching 2FA method:', error);
    res.status(400).json({ error: error.message || 'Failed to switch 2FA method' });
  }
});

/**
 * POST /2fa/trusted-devices
 * Add a new trusted device
 */
router.post('/trusted-devices', auth, async (req, res) => {
  try {
    const { deviceName, deviceType, os, browser } = req.body;

    const deviceInfo = {
      fingerprint: req.headers['x-device-fingerprint'] || '',
      name: deviceName || 'Trusted Device',
      type: deviceType || 'unknown',
      os: os || 'Unknown',
      browser: browser || 'Unknown',
      ipAddress: req.ip,
      location: {
        country: req.headers['x-device-country'],
        city: req.headers['x-device-city']
      }
    };

    const result = await twoFactorAuthService.addTrustedDevice(
      req.user.id,
      deviceInfo,
      'email'
    );

    res.json({
      success: true,
      deviceId: result.deviceId,
      message: 'Device added. Check your email for verification code.'
    });
  } catch (error) {
    console.error('Error adding trusted device:', error);
    res.status(400).json({ error: error.message || 'Failed to add trusted device' });
  }
});

/**
 * POST /2fa/trusted-devices/:deviceId/verify
 * Verify trusted device with verification code
 */
router.post('/trusted-devices/:deviceId/verify', auth, verifyCodeLimiter, async (req, res) => {
  try {
    const { verificationCode } = req.body;

    if (!verificationCode) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    const result = await twoFactorAuthService.verifyTrustedDevice(
      req.user.id,
      req.params.deviceId,
      verificationCode
    );

    res.json(result);
  } catch (error) {
    console.error('Error verifying trusted device:', error);
    res.status(400).json({ error: error.message || 'Failed to verify trusted device' });
  }
});

/**
 * GET /2fa/trusted-devices
 * Get all trusted devices for current user
 */
router.get('/trusted-devices', auth, async (req, res) => {
  try {
    const devices = await twoFactorAuthService.getTrustedDevices(req.user.id);
    res.json(devices);
  } catch (error) {
    console.error('Error getting trusted devices:', error);
    res.status(500).json({ error: 'Failed to get trusted devices' });
  }
});

/**
 * DELETE /2fa/trusted-devices/:deviceId
 * Remove a trusted device
 */
router.delete('/trusted-devices/:deviceId', auth, async (req, res) => {
  try {
    const result = await twoFactorAuthService.removeTrustedDevice(
      req.user.id,
      req.params.deviceId
    );

    res.json(result);
  } catch (error) {
    console.error('Error removing trusted device:', error);
    res.status(400).json({ error: error.message || 'Failed to remove trusted device' });
  }
});

/**
 * POST /2fa/recovery-email/set
 * Set recovery email
 */
router.post('/recovery-email/set', auth, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const twoFAAuth = await TwoFactorAuth.findOne({ userId: req.user.id });
    if (!twoFAAuth) {
      return res.status(400).json({ error: '2FA not configured' });
    }

    twoFAAuth.recoveryEmail = email;
    await twoFAAuth.save();

    // Log the action
    await AuditLog.create({
      userId: req.user.id,
      action: '2FA_RECOVERY_EMAIL_SET',
      actionType: 'security',
      resourceType: 'TwoFactorAuth'
    });

    res.json({ success: true, message: 'Recovery email set successfully' });
  } catch (error) {
    console.error('Error setting recovery email:', error);
    res.status(500).json({ error: 'Failed to set recovery email' });
  }
});

/**
 * POST /2fa/recovery-email/send-code
 * Send recovery email verification code
 */
router.post('/recovery-email/send-code', auth, async (req, res) => {
  try {
    const twoFAAuth = await TwoFactorAuth.findOne({ userId: req.user.id });
    if (!twoFAAuth || !twoFAAuth.recoveryEmail) {
      return res.status(400).json({ error: 'Recovery email not configured' });
    }

    twoFAAuth.recoveryEmailVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    twoFAAuth.recoveryEmailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
    await twoFAAuth.save();

    // Send email (using your email service)
    // await emailService.sendEmail(...);

    res.json({ success: true, message: 'Verification code sent to recovery email' });
  } catch (error) {
    console.error('Error sending recovery email code:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

/**
 * POST /2fa/backup-codes/download
 * Download backup codes
 */
router.post('/backup-codes/download', auth, async (req, res) => {
  try {
    const twoFAAuth = await TwoFactorAuth.findOne({ userId: req.user.id }).select('+backupCodes');

    if (!twoFAAuth || !twoFAAuth.enabled) {
      return res.status(400).json({ error: '2FA not enabled' });
    }

    const codes = twoFAAuth.backupCodes
      .filter(bc => !bc.used)
      .map(bc => bc.code)
      .join('\n');

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="backup-codes.txt"');
    res.send(`ExpenseFlow Backup Codes\n\n${codes}\n\nKeep these codes safe. Each code can only be used once.`);
  } catch (error) {
    console.error('Error downloading backup codes:', error);
    res.status(500).json({ error: 'Failed to download backup codes' });
  }
});

/**
 * POST /2fa/send-code-email
 * Send 2FA code via email
 */
router.post('/send-code-email', auth, async (req, res) => {
  try {
    const result = await twoFactorAuthService.send2FACodeEmail(req.user.id, req.user.email);
    res.json(result);
  } catch (error) {
    console.error('Error sending 2FA code:', error);
    res.status(500).json({ error: error.message || 'Failed to send 2FA code' });
  }
});

/**
 * POST /2fa/email/setup
 * Setup email as 2FA method
 */
router.post('/email/setup', auth, twoFactorLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const result = await twoFactorAuthService.setupEmailMethod(req.user.id, email);

    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    console.error('Error setting up email 2FA:', error);
    res.status(400).json({ error: error.message || 'Failed to setup email 2FA' });
  }
});

/**
 * POST /2fa/email/verify
 * Verify email and enable email 2FA
 */
router.post('/email/verify', auth, verifyCodeLimiter, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid verification code format' });
    }

    const result = await twoFactorAuthService.verifyAndEnableEmail(req.user.id, code);

    // Log the action
    await AuditLog.create({
      userId: req.user.id,
      action: '2FA_SETUP_COMPLETED',
      actionType: 'security',
      resourceType: 'TwoFactorAuth',
      details: {
        method: 'email'
      }
    });

    // Trigger account takeover alert for 2FA enable
    try {
      await accountTakeoverAlertingService.alertTwoFAChange(
        req.user.id,
        {
          action: 'enabled',
          method: 'email',
          ipAddress: req.ip,
          location: {
            city: req.body.location?.city,
            country: req.body.location?.country
          },
          userAgent: req.get('User-Agent'),
          timestamp: new Date()
        }
      );
    } catch (alertError) {
      console.error('Error sending 2FA change alert:', alertError);
    }

    res.json({
      success: true,
      backupCodes: result.backupCodes,
      message: result.message
    });
  } catch (error) {
    console.error('Error verifying email 2FA setup:', error);
    res.status(400).json({ error: error.message || 'Failed to verify email code' });
  }
});

/**
 * POST /2fa/email/verify-login
 * Verify email code during login
 */
router.post('/email/verify-login', auth, verifyCodeLimiter, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid code format' });
    }

    const result = await twoFactorAuthService.verifyEmailCode(req.user.id, code);

    // Log successful verification
    await AuditLog.create({
      userId: req.user.id,
      action: '2FA_VERIFIED',
      actionType: 'security',
      resourceType: 'TwoFactorAuth',
      details: {
        method: 'email'
      }
    });

    res.json({
      success: true,
      message: 'Email verification successful'
    });
  } catch (error) {
    console.error('Error verifying email code:', error);
    res.status(400).json({ error: error.message || 'Failed to verify email code' });
  }
});

/**
 * POST /2fa/sms/send-code
 * Send SMS code for 2FA setup
 */
router.post('/sms/send-code', auth, twoFactorLimiter, async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const result = await twoFactorAuthService.sendSMSCode(req.user.id, phoneNumber);

    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    console.error('Error sending SMS code:', error);
    res.status(400).json({ error: error.message || 'Failed to send SMS code' });
  }
});

/**
 * POST /2fa/sms/verify
 * Verify SMS code and enable SMS 2FA
 */
router.post('/sms/verify', auth, verifyCodeLimiter, async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid SMS code format' });
    }

    const result = await twoFactorAuthService.verifyAndEnableSMS(req.user.id, phoneNumber, code);

    // Log the action
    await AuditLog.create({
      userId: req.user.id,
      action: '2FA_SETUP_COMPLETED',
      actionType: 'security',
      resourceType: 'TwoFactorAuth',
      details: {
        method: 'sms'
      }
    });

    // Trigger account takeover alert for 2FA enable
    try {
      await accountTakeoverAlertingService.alertTwoFAChange(
        req.user.id,
        {
          action: 'enabled',
          method: 'sms',
          ipAddress: req.ip,
          location: {
            city: req.body.location?.city,
            country: req.body.location?.country
          },
          userAgent: req.get('User-Agent'),
          timestamp: new Date()
        }
      );
    } catch (alertError) {
      console.error('Error sending 2FA change alert:', alertError);
    }

    res.json({
      success: true,
      backupCodes: result.backupCodes,
      message: result.message
    });
  } catch (error) {
    console.error('Error verifying SMS setup:', error);
    res.status(400).json({ error: error.message || 'Failed to verify SMS code' });
  }
});

/**
 * POST /2fa/sms/verify-login
 * Verify SMS code during login
 */
router.post('/sms/verify-login', auth, verifyCodeLimiter, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid code format' });
    }

    const result = await twoFactorAuthService.verifySMSCode(req.user.id, code);

    // Log successful verification
    await AuditLog.create({
      userId: req.user.id,
      action: '2FA_VERIFIED',
      actionType: 'security',
      resourceType: 'TwoFactorAuth',
      details: {
        method: 'sms'
      }
    });

    res.json({
      success: true,
      message: 'SMS verification successful'
    });
  } catch (error) {
    console.error('Error verifying SMS code:', error);
    res.status(400).json({ error: error.message || 'Failed to verify SMS code' });
  }
});

/**
 * GET /2fa/audit-log
 * Get 2FA audit log
 */
router.get('/audit-log', auth, async (req, res) => {
  try {
    const logs = await AuditLog.find({
      userId: req.user.id,
      resourceType: 'TwoFactorAuth'
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(logs);
  } catch (error) {
    console.error('Error getting audit log:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

/**
 * GET /2fa/security-profile
 * Get user security profile and risk assessment
 * Issue #504: Security monitoring
 */
router.get('/security-profile', auth, async (req, res) => {
  try {
    const profile = await twoFactorAuthService.getUserSecurityProfile(req.user.id, 24);
    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Error getting security profile:', error);
    res.status(500).json({ error: 'Failed to get security profile' });
  }
});

/**
 * GET /2fa/security-events
 * Get recent security events
 * Issue #504: Security event tracking
 */
router.get('/security-events', auth, async (req, res) => {
  try {
    const SecurityEvent = require('../models/SecurityEvent');
    const hours = parseInt(req.query.hours) || 24;
    const limit = parseInt(req.query.limit) || 50;

    const events = await SecurityEvent.getRecentEvents(req.user.id, hours, limit);

    res.json({
      success: true,
      count: events.length,
      events
    });
  } catch (error) {
    console.error('Error getting security events:', error);
    res.status(500).json({ error: 'Failed to get security events' });
  }
});

/**
 * POST /2fa/check-suspicious-activity
 * Manually check for suspicious activity
 * Issue #504: Suspicious login detection
 */
router.post('/check-suspicious-activity', auth, async (req, res) => {
  try {
    const loginInfo = {
      ipAddress: req.body.ipAddress || req.ip,
      userAgent: req.body.userAgent || req.get('User-Agent'),
      deviceFingerprint: req.body.deviceFingerprint || req.headers['x-device-fingerprint'],
      location: req.body.location
    };

    const analysis = await twoFactorAuthService.checkSuspiciousLogin(req.user.id, loginInfo);

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('Error checking suspicious activity:', error);
    res.status(500).json({ error: 'Failed to check suspicious activity' });
  }
});

/**
 * GET /2fa/trusted-devices
 * Get list of trusted devices
 * Issue #504: Device fingerprinting
 */
router.get('/trusted-devices', auth, async (req, res) => {
  try {
    const TrustedDevice = require('../models/TrustedDevice');
    const devices = await TrustedDevice.find({
      userId: req.user.id,
      isActive: true
    })
      .select('-verificationCode')
      .sort({ verifiedAt: -1 });

    res.json({
      success: true,
      devices
    });
  } catch (error) {
    console.error('Error getting trusted devices:', error);
    res.status(500).json({ error: 'Failed to get trusted devices' });
  }
});

/**
 * DELETE /2fa/trusted-devices/:deviceId
 * Revoke trusted device
 * Issue #504: Device management
 */
router.delete('/trusted-devices/:deviceId', auth, async (req, res) => {
  try {
    const TrustedDevice = require('../models/TrustedDevice');
    
    const device = await TrustedDevice.findOne({
      _id: req.params.deviceId,
      userId: req.user.id
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    device.isActive = false;
    device.revokedAt = new Date();
    await device.save();

    await AuditLog.create({
      userId: req.user.id,
      action: 'TRUSTED_DEVICE_REVOKED',
      actionType: 'security',
      resourceType: 'TrustedDevice',
      resourceId: device._id,
      details: {
        deviceName: device.deviceName
      }
    });

    res.json({
      success: true,
      message: 'Device revoked successfully'
    });
  } catch (error) {
    console.error('Error revoking device:', error);
    res.status(500).json({ error: 'Failed to revoke device' });
  }
});

module.exports = router;
