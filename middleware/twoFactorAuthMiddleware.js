const TwoFactorAuth = require('../models/TwoFactorAuth');
const TrustedDevice = require('../models/TrustedDevice');
const SecurityEvent = require('../models/SecurityEvent');
const twoFactorAuthService = require('../services/twoFactorAuthService');
const suspiciousLoginDetectionService = require('../services/suspiciousLoginDetectionService');
const adaptiveMFAOrchestrator = require('../services/adaptiveMFAOrchestrator');
const AuditLog = require('../models/AuditLog');

/**
 * 2FA Middleware
 * Issue #503: 2FA Management
 * Issue #504: Security Requirements
 * Middleware for verifying 2FA requirements, device trust, and session validation
 */

/**
 * Check if 2FA is required for the user (Adaptive MFA)
 * Issue #871: Adaptive MFA Orchestrator
 */
const check2FARequired = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Gather login context for adaptive analysis
    const loginContext = {
      deviceFingerprint: req.headers['x-device-fingerprint'] || '',
      location: {
        ip: req.ip,
        country: req.body.location?.country,
        city: req.body.location?.city,
        coordinates: req.body.location?.coordinates
      },
      timestamp: new Date(),
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionID
    };

    // Use adaptive MFA orchestrator to determine requirement
    const mfaDecision = await adaptiveMFAOrchestrator.determineMFARequirement(
      req.user.id,
      loginContext
    );

    if (!mfaDecision.required) {
      // MFA bypassed - log the decision
      await AuditLog.create({
        userId: req.user.id,
        action: 'MFA_BYPASSED',
        actionType: 'security',
        resourceType: 'AdaptiveMFA',
        details: {
          confidence: mfaDecision.confidence,
          reasoning: mfaDecision.reasoning,
          context: loginContext
        }
      });
      return next();
    }

    // MFA required - store challenge info in session
    req.session.require2FA = true;
    req.session.mfaChallenge = mfaDecision.challenge;
    req.session.mfaContext = loginContext;
    req.session.mfaDecision = {
      confidence: mfaDecision.confidence,
      reasoning: mfaDecision.reasoning
    };

    return res.status(403).json({
      error: 'Adaptive MFA verification required',
      code: 'REQUIRE_ADAPTIVE_MFA',
      challenge: mfaDecision.challenge,
      confidence: mfaDecision.confidence.score,
      reasoning: mfaDecision.reasoning,
      twoFactorId: req.sessionID
    });
  } catch (error) {
    console.error('Error in adaptive 2FA check middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Verify adaptive MFA challenge
 * Issue #871: Adaptive MFA Orchestrator
 */
const verify2FA = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { code, method, challengeData } = req.body;

    // Get challenge context from session
    const challenge = req.session.mfaChallenge;
    const context = req.session.mfaContext;

    if (!challenge || !context) {
      return res.status(400).json({
        error: 'No active MFA challenge',
        code: 'NO_ACTIVE_CHALLENGE'
      });
    }

    // Determine challenge type
    const challengeType = method || challenge.type;

    // Prepare challenge data
    const verificationData = challengeData || { code };

    // Use adaptive MFA orchestrator to verify
    const verificationResult = await adaptiveMFAOrchestrator.verifyChallenge(
      req.user.id,
      challengeType,
      verificationData,
      context
    );

    if (!verificationResult.success) {
      // Handle failed verification
      return res.status(400).json({
        error: 'MFA verification failed',
        code: 'MFA_VERIFICATION_FAILED',
        reasoning: verificationResult.reasoning,
        nextAction: verificationResult.nextAction
      });
    }

    // Successful verification
    req.user.verified2FA = true;
    req.session.verified2FA = true;
    req.session.vaultGrant = true; // Issue #770: Session now trusted for vault access

    // Clear challenge data from session
    delete req.session.require2FA;
    delete req.session.mfaChallenge;
    delete req.session.mfaContext;
    delete req.session.mfaDecision;

    // Update last used info
    await twoFactorAuthService.updateLastUsed(req.user.id, req.ip, req.get('User-Agent'));

    res.json({
      success: true,
      message: 'MFA verification successful',
      reasoning: verificationResult.reasoning
    });

  } catch (error) {
    console.error('Error in adaptive MFA verification middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Require 2FA verification for sensitive actions
 */
const requireSensitive2FA = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const twoFAAuth = await TwoFactorAuth.findOne({ userId: req.user.id });

    if (twoFAAuth && twoFAAuth.enabled && twoFAAuth.requireForSensitiveActions) {
      if (!req.session.verified2FA && !req.user.verified2FA) {
        return res.status(403).json({
          error: '2FA verification required for this action',
          code: 'REQUIRE_2FA_SENSITIVE'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Error in sensitive 2FA middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Trust device middleware
 */
const trustDevice = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { trustDevice: shouldTrust } = req.body;

    if (shouldTrust && req.user.verified2FA) {
      const deviceInfo = {
        fingerprint: req.headers['x-device-fingerprint'] || '',
        name: req.headers['x-device-name'] || 'Trusted Device',
        type: req.headers['x-device-type'] || 'unknown',
        os: req.headers['x-device-os'] || 'Unknown',
        browser: req.headers['x-device-browser'] || 'Unknown',
        ipAddress: req.ip,
        location: {
          country: req.headers['x-device-country'],
          city: req.headers['x-device-city']
        }
      };

      try {
        const result = await twoFactorAuthService.addTrustedDevice(
          req.user.id,
          deviceInfo,
          'manual'
        );
        req.newTrustedDevice = result;
      } catch (error) {
        console.error('Error adding trusted device:', error);
      }
    }

    next();
  } catch (error) {
    console.error('Error in trust device middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Validate device trust status
 */
const validateDeviceTrust = async (req, res, next) => {
  try {
    const fingerprint = req.headers['x-device-fingerprint'];
    if (!fingerprint) {
      return next();
    }

    const device = await TrustedDevice.findOne({
      userId: req.user?.id,
      fingerprint,
      isActive: true
    });

    if (device && !device.isTrustExpired() && device.isVerified) {
      req.device = device;
      req.isDeviceTrusted = true;
    } else {
      req.isDeviceTrusted = false;
    }

    next();
  } catch (error) {
    console.error('Error validating device trust:', error);
    next();
  }
};

/**
 * Log security event for 2FA
 */
const log2FAEvent = (action) => {
  return async (req, res, next) => {
    try {
      if (req.user && req.user.id) {
        await AuditLog.create({
          userId: req.user.id,
          action: action,
          actionType: 'security',
          resourceType: 'TwoFactorAuth',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
      }
      next();
    } catch (error) {
      console.error('Error logging 2FA event:', error);
      next();
    }
  };
};

/**
 * Session validation middleware
 * Issue #504: Session validation after 2FA
 * Validates that session is still valid and matches original login context
 */
const validateSession = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next();
    }

    // Check if session has changed IP or user agent after 2FA
    if (req.session.verified2FA && req.session.original2FAContext) {
      const context = req.session.original2FAContext;
      const currentIP = req.ip;
      const currentUA = req.get('User-Agent');

      // If IP changed, flag as suspicious
      if (context.ipAddress !== currentIP) {
        await SecurityEvent.logEvent({
          userId: req.user.id,
          eventType: 'SESSION_VALIDATION_FAILED',
          severity: 'high',
          source: 'session_validation',
          ipAddress: currentIP,
          details: {
            reason: 'IP_CHANGED_AFTER_2FA',
            originalIP: context.ipAddress,
            currentIP: currentIP
          },
          riskScore: 30,
          action: 'challenged'
        });

        return res.status(403).json({
          error: 'Session validation failed. Please re-authenticate.',
          code: 'SESSION_INVALID'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Error validating session:', error);
    next();
  }
};

/**
 * Check for suspicious login before 2FA
 * Issue #504: Suspicious login detection
 */
const checkSuspiciousLogin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next();
    }

    const loginInfo = {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      deviceFingerprint: req.headers['x-device-fingerprint'],
      location: {
        country: req.headers['x-device-country'],
        city: req.headers['x-device-city']
      }
    };

    // Analyze for suspicious activity
    const suspiciousAnalysis = await suspiciousLoginDetectionService.analyzeLoginAttempt(
      req.user.id,
      loginInfo
    );

    // Store context for session validation
    req.session.original2FAContext = loginInfo;

    if (suspiciousAnalysis.requiresChallenge) {
      return res.status(403).json({
        error: 'Additional verification required due to suspicious activity',
        code: 'SUSPICIOUS_LOGIN_DETECTED',
        riskScore: suspiciousAnalysis.riskScore,
        flags: suspiciousAnalysis.flags
      });
    }

    // Attach analysis to request for logging
    req.loginAnalysis = suspiciousAnalysis;
    next();
  } catch (error) {
    console.error('Error checking suspicious login:', error);
    next();
  }
};

module.exports = {
  check2FARequired,
  verify2FA,
  requireSensitive2FA,
  trustDevice,
  validateDeviceTrust,
  log2FAEvent,
  validateSession,
  checkSuspiciousLogin
};
