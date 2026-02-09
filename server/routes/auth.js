const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');
const emailService = require('../services/emailService');
const securityMonitor = require('../services/securityMonitor');
const SecurityService = require('../services/securityService');
const DeviceFingerprint = require('../models/DeviceFingerprint');
const { captureDeviceFingerprint, generateFingerprint } = require('../middleware/deviceFingerprint');
const auth = require('../middleware/auth');
const { AuthSchemas, validateRequest } = require('../middleware/inputValidator');
const {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  emailVerifyLimiter,
  totpVerifyLimiter
} = require('../middleware/rateLimiter');
const ResponseFactory = require('../utils/ResponseFactory');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ConflictError, UnauthorizedError, BadRequestError } = require('../utils/AppError');
const router = express.Router();

/**
 * Authentication Routes with 2FA Support & Enhanced Validation & Rate Limiting
 * Issue #338: Enterprise-Grade Audit Trail & TOTP Security Suite
 * Issue #461: Missing Input Validation on User Data
 * Issue #460: Rate Limiting for Critical Endpoints
 */

// Register
router.post('/register', registerLimiter, validateRequest(AuthSchemas.register), asyncHandler(async (req, res) => {
  const existingUser = await User.findOne({ email: req.body.email });
  if (existingUser) throw new ConflictError('User already exists');

  const user = new User(req.body);
  await user.save();

  // Generate JWT with unique ID for session tracking
  const jwtId = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    { id: user._id, jti: jwtId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '24h' }
  );

  // Create session
  await Session.createSession(user._id, jwtId, req, {
    loginMethod: 'password',
    rememberMe: false
  });

  // Log registration
  await AuditLog.logAuthEvent(user._id, 'user_register', req, {
    severity: 'low',
    status: 'success'
  });

  // Send welcome email (non-blocking)
  emailService.sendWelcomeEmail(user).catch(err =>
    console.error('Welcome email failed:', err)
  );

  // Capture Device Fingerprint
  try {
    // Scope fingerprint to user
    const baseFingerprint = generateFingerprint(req);
    const fingerprintHash = `${baseFingerprint}_${user._id}`;

    await DeviceFingerprint.create({
      user: user._id,
      fingerprint: fingerprintHash,
      deviceInfo: {
        userAgent: req.headers['user-agent'],
        screen: {},
        language: req.headers['accept-language'],
        platform: req.headers['sec-ch-ua-platform']
      },
      networkInfo: {
        ipAddress: req.ip || req.connection.remoteAddress
      },
      status: 'trusted'
    });
  } catch (fpError) {
    console.error('Failed to save device fingerprint on register:', fpError);
  }

  return ResponseFactory.created(res, {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      locale: user.locale,
      preferredCurrency: user.preferredCurrency
    }
  }, 'Registration successful');
}));

// Login
router.post('/login', loginLimiter, validateRequest(AuthSchemas.login), async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      await securityMonitor.logSecurityEvent(req, 'failed_login', {
        email: req.body.email,
        reason: 'User not found'
      });
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check if account is locked
    if (user.isLocked()) {
      await AuditLog.logAuthEvent(user._id, 'login_blocked', req, {
        severity: 'high',
        status: 'blocked'
      });
      const lockoutMinutes = Math.ceil((user.security.lockoutUntil - Date.now()) / 60000);
      return res.status(423).json({
        error: `Account is locked. Please try again in ${lockoutMinutes} minutes.`,
        lockedUntil: user.security.lockoutUntil
      });
    }

    const isMatch = await user.comparePassword(req.body.password);
    if (!isMatch) {
      await user.incrementFailedLogins();
      await AuditLog.logAuthEvent(user._id, 'login_failed', req, {
        severity: 'medium',
        status: 'failure',
        securityContext: {
          failedAttempts: user.security.failedLoginAttempts + 1
        }
      });
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check if 2FA is enabled
    if (user.twoFactorAuth?.enabled) {
      if (!req.body.totpToken) {
        // Return indication that 2FA is required
        return res.status(200).json({
          requires2FA: true,
          userId: user._id,
          message: 'Please provide your 2FA verification code'
        });
      }

      // Verify TOTP token
      const verification = await SecurityService.verifyToken(user._id, req.body.totpToken, req);
      if (!verification.valid) {
        return res.status(400).json({ error: 'Invalid 2FA code' });
      }
    }

    // Reset failed login attempts and record login
    await user.recordLogin(req.ip || req.connection?.remoteAddress);

    // Generate JWT with unique ID
    const jwtId = crypto.randomBytes(16).toString('hex');
    const expiresIn = req.body.rememberMe ? '30d' : (process.env.JWT_EXPIRE || '24h');
    const token = jwt.sign(
      { id: user._id, jti: jwtId },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    // Create session
    const session = await Session.createSession(user._id, jwtId, req, {
      loginMethod: 'password',
      rememberMe: req.body.rememberMe || false,
      totpVerified: user.twoFactorAuth?.enabled || false
    });

    // Log successful login
    await AuditLog.logAuthEvent(user._id, 'user_login', req, {
      severity: 'low',
      status: 'success',
      securityContext: {
        totpUsed: user.twoFactorAuth?.enabled || false
      }
    });

    // Capture Device Fingerprint
    try {
      // Scope fingerprint to user to allow multiple users on same device (prevents unique constraint error)
      const baseFingerprint = generateFingerprint(req);
      const fingerprintHash = `${baseFingerprint}_${user._id}`;

      const existingDevice = await DeviceFingerprint.findOne({ fingerprint: fingerprintHash });

      if (!existingDevice) {
        await DeviceFingerprint.create({
          user: user._id,
          fingerprint: fingerprintHash,
          deviceInfo: {
            userAgent: req.headers['user-agent'],
            screen: req.body.screen || {},
            language: req.headers['accept-language'],
            platform: req.headers['sec-ch-ua-platform']
          },
          networkInfo: {
            ipAddress: req.ip || req.connection.remoteAddress
          },
          status: 'trusted'
        });
      } else {
        // Update last seen
        existingDevice.lastSeen = new Date();
        existingDevice.loginCount += 1;
        await existingDevice.save();
      }
    } catch (fpError) {
      console.error('Failed to save device fingerprint:', fpError);
      // Don't block login on fingerprint error
    }

    res.json({
      token,
      sessionId: session._id,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        locale: user.locale,
        preferredCurrency: user.preferredCurrency,
        twoFactorEnabled: user.twoFactorAuth?.enabled || false
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify 2FA token (for login flow)
router.post('/verify-2fa', async (req, res) => {
  try {
    const { userId, token: totpToken, rememberMe } = req.body;

    if (!userId || !totpToken) {
      return res.status(400).json({ error: 'User ID and token are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    // Verify TOTP token
    const verification = await SecurityService.verifyToken(userId, totpToken, req);
    if (!verification.valid) {
      return res.status(400).json({ error: 'Invalid 2FA code' });
    }

    // Generate JWT
    const jwtId = crypto.randomBytes(16).toString('hex');
    const expiresIn = rememberMe ? '30d' : (process.env.JWT_EXPIRE || '24h');
    const token = jwt.sign(
      { id: user._id, jti: jwtId },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    // Create session
    const session = await Session.createSession(user._id, jwtId, req, {
      loginMethod: 'password',
      rememberMe: rememberMe || false,
      totpVerified: true
    });

    // Record login
    await user.recordLogin(req.ip || req.connection?.remoteAddress);

    // Log successful login
    await AuditLog.logAuthEvent(user._id, 'user_login', req, {
      severity: 'low',
      status: 'success',
      securityContext: { totpUsed: true }
    });

    // Trigger account takeover alerting for new device login
    try {
      await accountTakeoverAlertingService.alertNewDeviceLogin(
        user._id,
        {
          deviceName: req.body.deviceName,
          deviceType: req.body.deviceType || 'unknown',
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip,
          location: {
            city: req.body.location?.city,
            country: req.body.location?.country,
            coordinates: req.body.location?.coordinates
          }
        },
        session
      );
    } catch (alertError) {
      console.error('Error sending account takeover alert:', alertError);
      // Don't fail login if alerting fails
    }

    res.json({
      token,
      sessionId: session._id,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        locale: user.locale,
        preferredCurrency: user.preferredCurrency,
        twoFactorEnabled: true
      },
      backupCodesRemaining: verification.remainingBackupCodes
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Logout
router.post('/logout', auth, async (req, res) => {
  try {
    // Find and invalidate the current session
    if (req.sessionId) {
      const session = await Session.findOne({ jwtId: req.jwtId, userId: req.user._id });
      if (session) {
        await session.logout();
      }
    }

    // Log logout
    await AuditLog.logAuthEvent(req.user._id, 'user_logout', req, {
      severity: 'low',
      status: 'success'
    });

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 2FA Management Routes
// ============================================

// Setup 2FA - Step 1: Generate secret and QR code
router.post('/2fa/setup', auth, async (req, res) => {
  try {
    const result = await SecurityService.setup2FA(req.user._id);
    res.json(result);
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Verify 2FA setup - Step 2: Confirm with valid token
router.post('/2fa/verify-setup', auth, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || token.length !== 6) {
      return res.status(400).json({ error: 'Valid 6-digit token required' });
    }

    const result = await SecurityService.verify2FASetup(req.user._id, token, req);
    res.json(result);
  } catch (error) {
    console.error('2FA verify setup error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Disable 2FA
router.post('/2fa/disable', auth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required to disable 2FA' });
    }

    const result = await SecurityService.disable2FA(req.user._id, password, req);
    res.json(result);
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get 2FA status
router.get('/2fa/status', auth, async (req, res) => {
  try {
    const status = await SecurityService.get2FAStatus(req.user._id);
    res.json(status);
  } catch (error) {
    console.error('2FA status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Regenerate backup codes
router.post('/2fa/backup-codes/regenerate', auth, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || token.length !== 6) {
      return res.status(400).json({ error: 'Valid 6-digit token required' });
    }

    const result = await SecurityService.regenerateBackupCodes(req.user._id, token, req);
    res.json(result);
  } catch (error) {
    console.error('Backup codes regeneration error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Session Management Routes
// ============================================

// Get active sessions
router.get('/sessions', auth, async (req, res) => {
  try {
    const sessions = await SecurityService.getActiveSessions(req.user._id);

    // Mark current session
    const currentJwtId = req.jwtId;
    const sessionsWithCurrent = sessions.map(session => ({
      id: session._id,
      device: session.device,
      location: session.location,
      createdAt: session.createdAt,
      lastAccessAt: session.activity.lastAccessAt,
      isCurrent: session.jwtId === currentJwtId,
      totpVerified: session.security.totpVerified
    }));

    res.json({ sessions: sessionsWithCurrent });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Revoke a specific session
router.delete('/sessions/:sessionId', auth, async (req, res) => {
  try {
    const result = await SecurityService.revokeSession(req.params.sessionId, req.user._id, req);
    res.json(result);
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Revoke all sessions except current (Logout from all devices)
router.post('/sessions/revoke-all', auth, async (req, res) => {
  try {
    // Find current session
    const currentSession = await Session.findOne({ jwtId: req.jwtId, userId: req.user._id });
    const currentSessionId = currentSession?._id;

    const result = await SecurityService.revokeAllSessions(req.user._id, currentSessionId, req);
    res.json(result);
  } catch (error) {
    console.error('Revoke all sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get login history
router.get('/sessions/history', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = await SecurityService.getLoginHistory(req.user._id, limit);
    res.json({ history });
  } catch (error) {
    console.error('Get login history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Security Audit Trail Routes
// ============================================

// Get security audit trail
router.get('/security/audit-trail', auth, async (req, res) => {
  try {
    const { days = 30, limit = 100 } = req.query;
    const auditTrail = await SecurityService.getSecurityAuditTrail(req.user._id, {
      days: parseInt(days),
      limit: parseInt(limit)
    });
    res.json({ auditTrail });
  } catch (error) {
    console.error('Get audit trail error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get security summary
router.get('/security/summary', auth, async (req, res) => {
  try {
    const [twoFAStatus, activeSessions, recentAudit] = await Promise.all([
      SecurityService.get2FAStatus(req.user._id),
      SecurityService.getActiveSessions(req.user._id),
      SecurityService.getSecurityAuditTrail(req.user._id, { days: 7, limit: 10 })
    ]);

    res.json({
      twoFactorAuth: twoFAStatus,
      activeSessions: activeSessions.length,
      recentActivity: recentAudit.slice(0, 5),
      securityScore: calculateSecurityScore(twoFAStatus, activeSessions)
    });
  } catch (error) {
    console.error('Get security summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Change password
router.post('/security/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    // Validate new password
    const { error } = Joi.object({
      newPassword: Joi.string()
        .min(12)
        .max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .required()
    }).validate({ newPassword });

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const user = await User.findById(req.user._id);

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Revoke all other sessions for security
    const currentSession = await Session.findOne({ jwtId: req.jwtId, userId: req.user._id });
    await Session.revokeAllUserSessions(req.user._id, req.user._id, 'password_change', currentSession?._id);

    // Log password change
    await AuditLog.logAuthEvent(req.user._id, 'password_changed', req, {
      severity: 'high',
      status: 'success'
    });

    // Trigger account takeover alert for password change
    try {
      await accountTakeoverAlertingService.alertPasswordChange(
        req.user._id,
        {
          ipAddress: req.ip,
          location: {
            city: req.body.location?.city,
            country: req.body.location?.country
          },
          userAgent: req.get('User-Agent'),
          timestamp: new Date(),
          initiatedBy: 'user'
        }
      );
    } catch (alertError) {
      console.error('Error sending password change alert:', alertError);
      // Don't fail password change if alerting fails
    }

    res.json({ 
      success: true, 
      message: 'Password changed successfully. Other sessions have been logged out.' 
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to calculate security score
function calculateSecurityScore(twoFAStatus, activeSessions) {
  let score = 50; // Base score

  // 2FA enabled: +30 points
  if (twoFAStatus.enabled) {
    score += 30;
  }

  // Backup codes remaining: +10 points if > 5
  if (twoFAStatus.remainingBackupCodes > 5) {
    score += 10;
  }

  // Reasonable number of active sessions: +10 points if <= 3
  if (activeSessions.length <= 3) {
    score += 10;
  } else if (activeSessions.length > 10) {
    score -= 10; // Too many sessions is a risk
  }

  return Math.min(100, Math.max(0, score));
}

module.exports = router;