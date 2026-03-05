/**
 * Zero-Trust Privilege Transition Monitor API Routes
 * Issue #872: Real-Time Privilege Transition Monitoring
 *
 * Provides endpoints for monitoring privilege transitions, active elevations,
 * and SOC dashboard visibility.
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const PrivilegeTransitionMonitor = require('../services/privilegeTransitionMonitor');
const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');
const { ResponseFactory } = require('../utils/ResponseFactory');
const { asyncHandler } = require('../middleware/errorMiddleware');

// Apply authentication to all routes
router.use(auth);

/**
 * Get risk-based recommendations
 */
function getRiskRecommendations(overallRisk, riskFactors) {
  const recommendations = [];

  if (overallRisk === 'HIGH') {
    recommendations.push('Immediate security review required');
    recommendations.push('Consider forcing privilege expiry');
    if (riskFactors.trustScore === 'HIGH') {
      recommendations.push('Session trust score critically low - recommend termination');
    }
  } else if (overallRisk === 'MEDIUM') {
    recommendations.push('Monitor closely for additional risk factors');
    if (riskFactors.timeRemainingMinutes < 30) {
      recommendations.push('Privilege expires soon - prepare for transition');
    }
  } else {
    recommendations.push('Normal monitoring sufficient');
  }

  return recommendations;
}

/**
 * GET /api/privilege-monitor/active-elevations
 * Get currently active privilege elevations for SOC monitoring
 */
router.get('/active-elevations', asyncHandler(async (req, res) => {
  // Require admin or security role
  if (!['admin', 'security_admin', 'security_analyst'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Security monitoring privileges required.'
    });
  }

  const elevations = PrivilegeTransitionMonitor.getActiveElevations();

  // Enrich with user and session data
  const enrichedElevations = await Promise.all(
    elevations.map(async (elevation) => {
      try {
        const session = await Session.findById(elevation.sessionId).populate('userId', 'name email');
        return {
          ...elevation,
          user: session?.userId ? {
            id: session.userId._id,
            name: session.userId.name,
            email: session.userId.email
          } : null,
          sessionInfo: {
            ipAddress: session?.ipAddress,
            userAgent: session?.userAgent,
            createdAt: session?.createdAt
          }
        };
      } catch (error) {
        return elevation; // Return basic data if enrichment fails
      }
    })
  );

  ResponseFactory.success(res, {
    count: enrichedElevations.length,
    elevations: enrichedElevations
  });
}));

/**
 * GET /api/privilege-monitor/statistics
 * Get privilege transition statistics for monitoring dashboard
 */
router.get('/statistics', asyncHandler(async (req, res) => {
  // Require admin or security role
  if (!['admin', 'security_admin', 'security_analyst'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Security monitoring privileges required.'
    });
  }

  const { timeframe = '24h' } = req.query;

  const stats = await PrivilegeTransitionMonitor.getTransitionStatistics(timeframe);

  // Get additional metrics
  const since = new Date(Date.now() - PrivilegeTransitionMonitor.parseTimeframe(timeframe));

  const totalTransitions = await AuditLog.countDocuments({
    action: 'PRIVILEGE_TRANSITION',
    createdAt: { $gte: since }
  });

  const criticalTransitions = await AuditLog.countDocuments({
    action: 'PRIVILEGE_TRANSITION',
    severity: 'CRITICAL',
    createdAt: { $gte: since }
  });

  const jitGrants = await AuditLog.countDocuments({
    action: 'JIT_PRIVILEGE_GRANTED',
    createdAt: { $gte: since }
  });

  const jitExpiries = await AuditLog.countDocuments({
    action: 'JIT_PRIVILEGE_EXPIRED',
    createdAt: { $gte: since }
  });

  ResponseFactory.success(res, {
    timeframe,
    summary: {
      totalTransitions,
      criticalTransitions,
      jitGrants,
      jitExpiries,
      activeElevations: PrivilegeTransitionMonitor.getActiveElevations().length
    },
    breakdown: stats
  });
}));

/**
 * GET /api/privilege-monitor/transitions
 * Get detailed privilege transition logs
 */
router.get('/transitions', asyncHandler(async (req, res) => {
  // Require admin or security role
  if (!['admin', 'security_admin', 'security_analyst'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Security monitoring privileges required.'
    });
  }

  const {
    page = 1,
    limit = 50,
    type,
    severity,
    sessionId,
    userId,
    startDate,
    endDate
  } = req.query;

  const query = { action: 'PRIVILEGE_TRANSITION' };

  if (type) query['details.transition.type'] = type;
  if (severity) query.severity = severity;
  if (sessionId) query.sessionId = sessionId;
  if (userId) query.userId = userId;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const transitions = await AuditLog.find(query)
    .populate('userId', 'name email')
    .populate('sessionId', 'ipAddress userAgent')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  const total = await AuditLog.countDocuments(query);

  ResponseFactory.success(res, {
    transitions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

/**
 * POST /api/privilege-monitor/force-expiry
 * Force expiry of a privilege elevation (admin only)
 */
router.post('/force-expiry/:sessionId', asyncHandler(async (req, res) => {
  // Require admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin privileges required.'
    });
  }

  const { sessionId } = req.params;

  // Check if elevation exists
  const elevations = PrivilegeTransitionMonitor.getActiveElevations();
  const elevation = elevations.find(e => e.sessionId === sessionId);

  if (!elevation) {
    return res.status(404).json({
      success: false,
      error: 'No active privilege elevation found for this session.'
    });
  }

  // Force expiry
  await PrivilegeTransitionMonitor.expireJITPrivilege(sessionId, elevation.transition);

  // Log the forced expiry
  const auditEntry = new AuditLog({
    userId: req.user._id,
    sessionId,
    action: 'FORCED_PRIVILEGE_EXPIRY',
    resource: 'PRIVILEGE_ELEVATION',
    details: {
      forcedBy: req.user._id,
      elevation: elevation,
      forcedAt: new Date()
    },
    severity: 'HIGH',
    source: 'PRIVILEGE_TRANSITION_MONITOR'
  });

  await auditEntry.save();

  ResponseFactory.success(res, {
    message: 'Privilege elevation forcibly expired.',
    sessionId,
    expiredAt: new Date()
  });
}));

/**
 * GET /api/privilege-monitor/risk-assessment
 * Get risk assessment for active privilege elevations
 */
router.get('/risk-assessment', asyncHandler(async (req, res) => {
  // Require admin or security role
  if (!['admin', 'security_admin', 'security_analyst'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Security monitoring privileges required.'
    });
  }

  const elevations = PrivilegeTransitionMonitor.getActiveElevations();

  const riskAssessment = await Promise.all(
    elevations.map(async (elevation) => {
      try {
        // Get current trust score
        const trustScore = await PrivilegeTransitionMonitor.getCurrentTrustScore(elevation.sessionId);

        // Calculate risk based on various factors
        const riskFactors = {
          trustScore: trustScore < 70 ? 'HIGH' : trustScore < 85 ? 'MEDIUM' : 'LOW',
          transitionType: elevation.transition.type,
          escalationLevel: elevation.transition.escalationLevel || 1,
          timeRemaining: Math.max(0, elevation.expiresAt - Date.now()),
          timeRemainingMinutes: Math.ceil(Math.max(0, elevation.expiresAt - Date.now()) / (60 * 1000))
        };

        // Calculate overall risk
        let overallRisk = 'LOW';
        if (riskFactors.trustScore === 'HIGH' || riskFactors.escalationLevel >= 3) {
          overallRisk = 'HIGH';
        } else if (riskFactors.trustScore === 'MEDIUM' || riskFactors.timeRemainingMinutes < 30) {
          overallRisk = 'MEDIUM';
        }

        return {
          sessionId: elevation.sessionId,
          transition: elevation.transition,
          riskFactors,
          overallRisk,
          recommendations: this.getRiskRecommendations(overallRisk, riskFactors)
        };
      } catch (error) {
        return {
          sessionId: elevation.sessionId,
          error: 'Failed to assess risk',
          overallRisk: 'UNKNOWN'
        };
      }
    })
  );

  ResponseFactory.success(res, {
    assessment: riskAssessment,
    summary: {
      total: riskAssessment.length,
      highRisk: riskAssessment.filter(a => a.overallRisk === 'HIGH').length,
      mediumRisk: riskAssessment.filter(a => a.overallRisk === 'MEDIUM').length,
      lowRisk: riskAssessment.filter(a => a.overallRisk === 'LOW').length
    }
  });
}));

module.exports = router;