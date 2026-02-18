const SessionAnomalyDetectionService = require('../services/sessionAnomalyDetectionService');
const Session = require('../models/Session');

/**
 * Session Anomaly Detection Middleware
 * Issue #562: Session Hijacking Detection via IP/UA Drift
 * 
 * This middleware checks for session anomalies on every authenticated request:
 * - IP address changes
 * - User Agent changes
 * - Impossible travel patterns
 * - Rapid session switching
 * 
 * Based on risk score, it will:
 * - Allow: Continue normal operation
 * - Warn: Log warning but allow access
 * - Require 2FA: Request 2FA verification
 * - Force Re-auth: Revoke session and require login
 */

/**
 * Main session anomaly detection middleware
 * Should be used after the auth middleware
 */
const checkSessionAnomaly = async (req, res, next) => {
  try {
    // Skip if no session (user not authenticated)
    if (!req.sessionId || !req.user) {
      return next();
    }

    // Check for session anomalies
    const anomalyCheck = await SessionAnomalyDetectionService.checkSessionAnomaly(
      req.sessionId,
      req
    );

    // Attach anomaly info to request for logging
    req.sessionAnomaly = anomalyCheck;

    // Handle based on action
    switch (anomalyCheck.action) {
      case 'FORCE_REAUTH':
        // Revoke session and force re-authentication
        await SessionAnomalyDetectionService.forceReauthentication(
          req.sessionId,
          `Session anomaly detected: ${anomalyCheck.anomalyType.join(', ')}`
        );
        
        return res.status(401).json({
          error: 'Session security violation detected. Please login again.',
          code: 'SESSION_ANOMALY_REAUTH_REQUIRED',
          anomalyDetected: true,
          anomalyTypes: anomalyCheck.anomalyType,
          riskScore: anomalyCheck.riskScore,
          requiresReauth: true
        });

      case 'REQUIRE_2FA':
        // Require 2FA verification to continue
        // Check if already verified recently
        const session = await Session.findById(req.sessionId);
        
        if (session?.security?.totpVerified) {
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          
          // If verified within last 5 minutes, allow
          if (session.security.totpVerifiedAt > fiveMinutesAgo) {
            return next();
          }
        }

        return res.status(403).json({
          error: 'Session anomaly detected. 2FA verification required to continue.',
          code: 'SESSION_ANOMALY_2FA_REQUIRED',
          anomalyDetected: true,
          anomalyTypes: anomalyCheck.anomalyType,
          riskScore: anomalyCheck.riskScore,
          requires2FA: true
        });

      case 'WARN':
        // Log warning but allow access
        console.warn(`Session anomaly warning for user ${req.user._id}:`, {
          anomalyTypes: anomalyCheck.anomalyType,
          riskScore: anomalyCheck.riskScore
        });
        
        // Update session activity with warning flag
        if (session) {
          session.activity.lastAccessAt = new Date();
          session.activity.lastAccessIp = req.ip || req.connection?.remoteAddress;
          session.activity.accessCount += 1;
          await session.save();
        }
        
        return next();

      case 'ALLOW':
      default:
        // Update session activity
        const activeSession = await Session.findById(req.sessionId);
        if (activeSession) {
          activeSession.activity.lastAccessAt = new Date();
          activeSession.activity.lastAccessIp = req.ip || req.connection?.remoteAddress;
          activeSession.activity.accessCount += 1;
          await activeSession.save();
        }
        
        return next();
    }
  } catch (error) {
    console.error('Session anomaly detection middleware error:', error);
    
    // Fail-open approach: allow request to continue but log the error
    // In high-security environments, you might want to fail-closed
    next();
  }
};

/**
 * Strict session anomaly detection middleware
 * Fails closed on errors (denies access if check fails)
 * Use for highly sensitive endpoints
 */
const strictSessionAnomaly = async (req, res, next) => {
  try {
    // Skip if no session (user not authenticated)
    if (!req.sessionId || !req.user) {
      return next();
    }

    // Check for session anomalies
    const anomalyCheck = await SessionAnomalyDetectionService.checkSessionAnomaly(
      req.sessionId,
      req
    );

    // Attach anomaly info to request
    req.sessionAnomaly = anomalyCheck;

    // Strict mode: deny access if any anomaly detected
    if (anomalyCheck.hasAnomaly) {
      await SessionAnomalyDetectionService.forceReauthentication(
        req.sessionId,
        `Session anomaly detected on sensitive endpoint: ${anomalyCheck.anomalyType.join(', ')}`
      );
      
      return res.status(401).json({
        error: 'Session security violation detected. Please login again.',
        code: 'SESSION_ANOMALY_DETECTED',
        anomalyDetected: true,
        anomalyTypes: anomalyCheck.anomalyType,
        riskScore: anomalyCheck.riskScore,
        requiresReauth: true
      });
    }

    // Update session activity
    const session = await Session.findById(req.sessionId);
    if (session) {
      session.activity.lastAccessAt = new Date();
      session.activity.lastAccessIp = req.ip || req.connection?.remoteAddress;
      session.activity.accessCount += 1;
      await session.save();
    }

    next();
  } catch (error) {
    console.error('Strict session anomaly detection error:', error);
    
    // Fail-closed: deny access on error in strict mode
    return res.status(500).json({
      error: 'Session validation failed. Please try again or re-login.',
      code: 'SESSION_VALIDATION_ERROR'
    });
  }
};

/**
 * Middleware to verify 2FA after session anomaly
 * Use this after an anomaly requiring 2FA is detected
 */
const verifyAnomalyTOTP = async (req, res, next) => {
  try {
    const user = req.user;
    const totpToken = req.header('X-TOTP-Token') || req.body.totpToken;
    
    if (!totpToken) {
      return res.status(403).json({
        error: '2FA token required to proceed',
        code: 'TOTP_REQUIRED'
      });
    }

    // Verify TOTP
    const SecurityService = require('../services/securityService');
    const verification = await SecurityService.verifyToken(user._id, totpToken, req);
    
    if (!verification.valid) {
      // Too many failed attempts - force re-auth
      return res.status(403).json({
        error: 'Invalid 2FA token. Please login again.',
        code: 'INVALID_TOTP_REAUTH_REQUIRED',
        requiresReauth: true
      });
    }

    // Mark session as TOTP verified
    if (req.sessionId) {
      const session = await Session.findById(req.sessionId);
      if (session) {
        session.security.totpVerified = true;
        session.security.totpVerifiedAt = new Date();
        await session.save();
      }
    }

    next();
  } catch (error) {
    console.error('Anomaly TOTP verification error:', error);
    res.status(500).json({ 
      error: '2FA verification failed',
      code: 'TOTP_VERIFICATION_ERROR'
    });
  }
};

/**
 * Optional middleware to add session anomaly info to response headers
 * Useful for client-side monitoring
 */
const addAnomalyHeaders = (req, res, next) => {
  if (req.sessionAnomaly) {
    res.setHeader('X-Session-Risk-Score', req.sessionAnomaly.riskScore);
    res.setHeader('X-Session-Has-Anomaly', req.sessionAnomaly.hasAnomaly);
    
    if (req.sessionAnomaly.hasAnomaly) {
      res.setHeader('X-Session-Anomaly-Types', req.sessionAnomaly.anomalyType.join(','));
    }
  }
  next();
};

/**
 * Middleware to get session anomaly statistics
 * Use for admin/security dashboards
 */
const getAnomalyStats = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;
    const days = parseInt(req.query.days) || 30;

    // Check authorization (users can only see their own stats unless admin)
    if (userId !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({
        error: 'Unauthorized to view other users\' statistics'
      });
    }

    const stats = await SessionAnomalyDetectionService.getAnomalyStatistics(userId, days);

    res.json({
      success: true,
      userId,
      period: `${days} days`,
      statistics: stats
    });
  } catch (error) {
    console.error('Error getting anomaly stats:', error);
    res.status(500).json({
      error: 'Failed to retrieve anomaly statistics'
    });
  }
};

module.exports = {
  checkSessionAnomaly,
  strictSessionAnomaly,
  verifyAnomalyTOTP,
  addAnomalyHeaders,
  getAnomalyStats
};
