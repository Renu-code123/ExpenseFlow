const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

/**
 * Enhanced Authentication Middleware with Session Tracking
 * Issue #338: Enterprise-Grade Audit Trail & TOTP Security Suite
 */

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Validate session if jti is present
    if (decoded.jti) {
      const sessionValidation = await Session.validateSession(decoded.jti);
      
      if (!sessionValidation.valid) {
        return res.status(401).json({ 
          error: 'Session expired or revoked. Please login again.',
          code: 'SESSION_INVALID'
        });
      }

      // Attach session info to request
      req.sessionId = sessionValidation.session._id;
      req.jwtId = decoded.jti;
      
      // Update session activity
      sessionValidation.session.activity.lastEndpoint = req.originalUrl;
    }
    
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token.' });
    }

    // Check if account is locked
    if (user.isLocked && user.isLocked()) {
      return res.status(423).json({ 
        error: 'Account is locked. Please try again later.',
        code: 'ACCOUNT_LOCKED'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired. Please login again.',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token.',
        code: 'TOKEN_INVALID'
      });
    }
    res.status(401).json({ error: 'Authentication failed.' });
  }
};

/**
 * Middleware to require 2FA verification for sensitive actions
 */
const require2FA = async (req, res, next) => {
  try {
    const user = req.user;
    
    // If 2FA is not enabled, allow access
    if (!user.twoFactorAuth?.enabled) {
      return next();
    }

    // Check if user has requireTotpForSensitiveActions enabled
    if (!user.security?.requireTotpForSensitiveActions) {
      return next();
    }

    // Check if session has verified TOTP recently (within 15 minutes)
    if (req.sessionId) {
      const session = await Session.findById(req.sessionId);
      
      if (session?.security?.totpVerified) {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        
        if (session.security.totpVerifiedAt > fifteenMinutesAgo) {
          return next();
        }
      }
    }

    // Require 2FA verification
    return res.status(403).json({
      error: 'This action requires 2FA verification',
      code: 'REQUIRE_2FA',
      requires2FA: true
    });
  } catch (error) {
    console.error('2FA check error:', error);
    res.status(500).json({ error: 'Authentication check failed' });
  }
};

/**
 * Middleware to verify 2FA token for sensitive operations
 */
const verify2FAToken = async (req, res, next) => {
  try {
    const user = req.user;
    const totpToken = req.header('X-TOTP-Token') || req.body.totpToken;
    
    // If 2FA is not enabled, allow access
    if (!user.twoFactorAuth?.enabled) {
      return next();
    }

    if (!totpToken) {
      return res.status(403).json({
        error: '2FA token required',
        code: 'REQUIRE_2FA',
        requires2FA: true
      });
    }

    // Import security service to verify
    const SecurityService = require('../services/securityService');
    const verification = await SecurityService.verifyToken(user._id, totpToken, req);
    
    if (!verification.valid) {
      return res.status(403).json({
        error: 'Invalid 2FA token',
        code: 'INVALID_2FA'
      });
    }

    // Mark session as TOTP verified
    if (req.sessionId) {
      const session = await Session.findById(req.sessionId);
      if (session) {
        await session.markTotpVerified();
      }
    }

    next();
  } catch (error) {
    console.error('2FA verification error:', error);
    res.status(500).json({ error: '2FA verification failed' });
  }
};

/**
 * Optional auth - doesn't fail if no token, but attaches user if valid token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (user) {
      req.user = user;
      req.jwtId = decoded.jti;
    }
    
    next();
  } catch (error) {
    // Token invalid, but optional - continue without user
    next();
  }
};

module.exports = auth;
module.exports.auth = auth;
module.exports.authenticateToken = auth;
module.exports.require2FA = require2FA
module.exports.verify2FAToken = verify2FAToken;
module.exports.optionalAuth = optionalAuth;