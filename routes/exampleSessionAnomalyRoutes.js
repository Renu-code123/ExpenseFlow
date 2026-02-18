/**
 * Example Routes with Session Anomaly Detection
 * Issue #562: Session Hijacking Detection
 * 
 * This file demonstrates various ways to integrate session anomaly detection
 * into your API routes.
 */

const express = require('express');
const router = express.Router();
const { 
  auth, 
  checkSessionAnomaly, 
  strictSessionAnomaly,
  require2FA
} = require('../middleware/auth');
const { 
  getAnomalyStats,
  verifyAnomalyTOTP
} = require('../middleware/sessionAnomalyDetection');

// ============================================================================
// EXAMPLE 1: Standard Routes (Automatic Anomaly Detection)
// ============================================================================
// The auth middleware automatically includes session anomaly detection
// Critical anomalies (risk score >= 75) automatically force re-authentication

/**
 * GET /api/transactions
 * Standard protection - automatic anomaly detection built into auth middleware
 */
router.get('/transactions', auth, async (req, res) => {
  try {
    // Access anomaly information if needed
    if (req.sessionAnomaly && req.sessionAnomaly.hasAnomaly) {
      console.log('Session anomaly detected:', {
        types: req.sessionAnomaly.anomalyType,
        riskScore: req.sessionAnomaly.riskScore,
        action: req.sessionAnomaly.action
      });
    }

    // Your normal route logic here
    res.json({
      success: true,
      transactions: [] // Your transaction data
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ============================================================================
// EXAMPLE 2: Explicit Anomaly Detection (Manual Control)
// ============================================================================
// Apply checkSessionAnomaly as a separate middleware for more visibility

/**
 * GET /api/profile
 * Explicit anomaly check as separate middleware
 */
router.get('/profile', auth, checkSessionAnomaly, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ============================================================================
// EXAMPLE 3: High-Security Endpoints (Strict Mode)
// ============================================================================
// Use strictSessionAnomaly for zero-tolerance on sensitive operations
// Any anomaly (even low risk) will force re-authentication

/**
 * POST /api/account/delete
 * Strict mode: Any session anomaly forces re-authentication
 */
router.post('/account/delete', auth, strictSessionAnomaly, async (req, res) => {
  try {
    // Delete account logic here
    res.json({
      success: true,
      message: 'Account deletion initiated'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

/**
 * POST /api/transfer/funds
 * Strict mode + 2FA: Maximum security for financial transactions
 */
router.post('/transfer/funds', auth, strictSessionAnomaly, require2FA, async (req, res) => {
  try {
    const { recipientId, amount, currency } = req.body;

    // Your fund transfer logic here
    res.json({
      success: true,
      message: 'Transfer completed successfully',
      transactionId: 'txn_12345'
    });
  } catch (error) {
    res.status(500).json({ error: 'Transfer failed' });
  }
});

/**
 * PUT /api/account/password
 * Strict mode for password changes
 */
router.put('/account/password', auth, strictSessionAnomaly, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Password change logic here
    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Password update failed' });
  }
});

// ============================================================================
// EXAMPLE 4: 2FA Step-Up Authentication
// ============================================================================
// For medium-risk anomalies, require 2FA verification to continue

/**
 * POST /api/settings/update
 * With 2FA step-up for anomaly-detected requests
 */
router.post('/settings/update', auth, checkSessionAnomaly, async (req, res) => {
  try {
    // Check if 2FA is required due to anomaly
    if (req.sessionAnomaly && req.sessionAnomaly.action === 'REQUIRE_2FA') {
      // Client should retry with X-TOTP-Token header
      return res.status(403).json({
        error: 'Session anomaly detected. 2FA verification required.',
        code: 'SESSION_ANOMALY_2FA_REQUIRED',
        anomalyTypes: req.sessionAnomaly.anomalyType,
        requires2FA: true
      });
    }

    // Update settings logic here
    res.json({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Settings update failed' });
  }
});

/**
 * POST /api/settings/verify-and-update
 * Alternative: Use verifyAnomalyTOTP middleware
 */
router.post('/settings/verify-and-update', auth, verifyAnomalyTOTP, async (req, res) => {
  try {
    // This will only execute if 2FA is verified (when required)
    res.json({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Settings update failed' });
  }
});

// ============================================================================
// EXAMPLE 5: Custom Risk Handling
// ============================================================================
// Implement custom logic based on anomaly risk scores

/**
 * POST /api/payment/process
 * Custom risk-based handling
 */
router.post('/payment/process', auth, async (req, res) => {
  try {
    const { amount, method } = req.body;

    // Check anomaly risk
    if (req.sessionAnomaly && req.sessionAnomaly.hasAnomaly) {
      const { riskScore, anomalyType } = req.sessionAnomaly;

      // Custom logic: High-value transactions with anomalies require 2FA
      if (amount > 1000 && riskScore >= 25) {
        return res.status(403).json({
          error: 'Additional verification required for this transaction',
          code: 'HIGH_RISK_TRANSACTION',
          requires2FA: true,
          anomalyDetected: true
        });
      }

      // Log high-risk transactions for review
      if (riskScore >= 50) {
        console.warn('High-risk transaction attempt:', {
          userId: req.user._id,
          amount,
          riskScore,
          anomalyType
        });
        // Could trigger manual review process
      }
    }

    // Process payment
    res.json({
      success: true,
      message: 'Payment processed',
      transactionId: 'pay_12345'
    });
  } catch (error) {
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// ============================================================================
// EXAMPLE 6: Security Dashboard Endpoints
// ============================================================================

/**
 * GET /api/security/anomaly-stats
 * Get anomaly statistics for current user
 */
router.get('/security/anomaly-stats', auth, getAnomalyStats);

/**
 * GET /api/security/anomaly-stats/:userId
 * Get anomaly statistics for specific user (admin only)
 */
router.get('/security/anomaly-stats/:userId', auth, async (req, res, next) => {
  // Check if user is admin
  if (!req.user.isAdmin) {
    return res.status(403).json({
      error: 'Admin access required'
    });
  }
  next();
}, getAnomalyStats);

/**
 * GET /api/security/session-info
 * Get current session security information
 */
router.get('/security/session-info', auth, async (req, res) => {
  try {
    const Session = require('../models/Session');
    const session = await Session.findById(req.sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      session: {
        id: session._id,
        createdAt: session.createdAt,
        lastAccessAt: session.activity.lastAccessAt,
        device: session.device,
        location: {
          ipAddress: session.location.ipAddress,
          country: session.location.country,
          city: session.location.city
        },
        security: {
          trustLevel: session.security.trustLevel,
          riskScore: session.security.riskScore,
          flags: session.security.flags,
          totpVerified: session.security.totpVerified
        },
        // Include current anomaly status if available
        currentAnomaly: req.sessionAnomaly
      }
    });
  } catch (error) {
    console.error('Error fetching session info:', error);
    res.status(500).json({ error: 'Failed to fetch session info' });
  }
});

// ============================================================================
// EXAMPLE 7: Conditional Anomaly Detection
// ============================================================================

/**
 * POST /api/actions/low-risk
 * Optionally skip anomaly detection for low-risk actions
 */
router.post('/actions/low-risk', auth, async (req, res) => {
  try {
    // For low-risk actions, you might choose to only log anomalies
    // but not enforce them
    if (req.sessionAnomaly && req.sessionAnomaly.hasAnomaly) {
      console.log('Anomaly detected on low-risk action (allowed):', req.sessionAnomaly);
      // Could update a counter or metric
    }

    res.json({
      success: true,
      message: 'Action completed'
    });
  } catch (error) {
    res.status(500).json({ error: 'Action failed' });
  }
});

/**
 * POST /api/actions/high-risk
 * Always use strict mode for high-risk actions
 */
router.post('/actions/high-risk', auth, strictSessionAnomaly, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'High-risk action completed'
    });
  } catch (error) {
    res.status(500).json({ error: 'Action failed' });
  }
});

// ============================================================================
// EXAMPLE 8: Gradual Enforcement
// ============================================================================
// Start with logging only, then gradually increase enforcement

/**
 * POST /api/gradual-enforcement
 * Example of gradual rollout strategy
 */
router.post('/gradual-enforcement', auth, async (req, res) => {
  try {
    const ENFORCEMENT_MODE = process.env.ANOMALY_ENFORCEMENT_MODE || 'LOG_ONLY';

    if (req.sessionAnomaly && req.sessionAnomaly.hasAnomaly) {
      switch (ENFORCEMENT_MODE) {
        case 'LOG_ONLY':
          // Phase 1: Just log anomalies, don't block
          console.log('Anomaly detected (logging only):', req.sessionAnomaly);
          break;

        case 'CRITICAL_ONLY':
          // Phase 2: Block only critical anomalies
          if (req.sessionAnomaly.riskScore >= 90) {
            return res.status(401).json({
              error: 'Critical security anomaly detected',
              code: 'SESSION_ANOMALY_DETECTED',
              requiresReauth: true
            });
          }
          break;

        case 'FULL_ENFORCEMENT':
          // Phase 3: Full enforcement based on risk score
          if (req.sessionAnomaly.action === 'FORCE_REAUTH') {
            return res.status(401).json({
              error: 'Session anomaly detected. Please login again.',
              code: 'SESSION_ANOMALY_DETECTED',
              requiresReauth: true
            });
          }
          break;
      }
    }

    res.json({
      success: true,
      message: 'Action completed'
    });
  } catch (error) {
    res.status(500).json({ error: 'Action failed' });
  }
});

module.exports = router;
