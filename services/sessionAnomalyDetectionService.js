const Session = require('../models/Session');
const SecurityEvent = require('../models/SecurityEvent');
const AuditLog = require('../models/AuditLog');

/**
 * Session Anomaly Detection Service
 * Issue #562: Session Hijacking Detection
 * 
 * Detects session hijacking attempts by monitoring:
 * - IP address changes during active sessions
 * - User Agent changes during active sessions
 * - Geographic location anomalies
 * - Rapid session switching patterns
 */

class SessionAnomalyDetectionService {
  /**
   * Configuration for anomaly detection
   */
  static config = {
    // Allow minor User-Agent changes (version updates)
    strictUserAgentMatching: false,
    
    // IP change detection
    allowIPChange: false, // Set to true to allow IP changes (e.g., for mobile users)
    
    // Geographic distance threshold in kilometers
    maxGeoDistanceThreshold: 500,
    
    // Time threshold for impossible travel (in minutes)
    impossibleTravelThreshold: 60,
    
    // Risk score thresholds
    riskScoreThresholds: {
      low: 25,
      medium: 50,
      high: 75,
      critical: 90
    }
  };

  /**
   * Check session for anomalies
   * @param {string} sessionId - Session ID to check
   * @param {object} currentRequest - Current request object
   * @returns {Promise<{hasAnomaly: boolean, anomalyType: string[], riskScore: number, action: string}>}
   */
  static async checkSessionAnomaly(sessionId, currentRequest) {
    try {
      const session = await Session.findById(sessionId);
      
      if (!session) {
        return {
          hasAnomaly: true,
          anomalyType: ['SESSION_NOT_FOUND'],
          riskScore: 100,
          action: 'FORCE_REAUTH'
        };
      }

      if (session.status !== 'active') {
        return {
          hasAnomaly: true,
          anomalyType: ['SESSION_INACTIVE'],
          riskScore: 100,
          action: 'FORCE_REAUTH'
        };
      }

      const anomalyTypes = [];
      let riskScore = 0;

      // Extract current request details
      const currentIP = currentRequest.ip || currentRequest.connection?.remoteAddress;
      const currentUA = currentRequest.headers?.['user-agent'];
      
      // Check IP address drift
      const ipCheck = await this.checkIPDrift(session, currentIP);
      if (ipCheck.isDrift) {
        anomalyTypes.push('IP_DRIFT');
        riskScore += ipCheck.riskIncrease;
      }

      // Check User Agent drift
      const uaCheck = await this.checkUserAgentDrift(session, currentUA);
      if (uaCheck.isDrift) {
        anomalyTypes.push('USER_AGENT_DRIFT');
        riskScore += uaCheck.riskIncrease;
      }

      // Check for impossible travel (if both IP and location changed)
      if (ipCheck.isDrift && session.location) {
        const travelCheck = await this.checkImpossibleTravel(session, currentRequest);
        if (travelCheck.isImpossible) {
          anomalyTypes.push('IMPOSSIBLE_TRAVEL');
          riskScore += travelCheck.riskIncrease;
        }
      }

      // Check for rapid session switching
      const switchCheck = await this.checkRapidSessionSwitching(session.userId);
      if (switchCheck.isSuspicious) {
        anomalyTypes.push('RAPID_SESSION_SWITCHING');
        riskScore += switchCheck.riskIncrease;
      }

      const hasAnomaly = anomalyTypes.length > 0;

      // Determine action based on risk score
      let action = 'ALLOW';
      if (riskScore >= this.config.riskScoreThresholds.critical) {
        action = 'FORCE_REAUTH';
      } else if (riskScore >= this.config.riskScoreThresholds.high) {
        action = 'FORCE_REAUTH';
      } else if (riskScore >= this.config.riskScoreThresholds.medium) {
        action = 'REQUIRE_2FA';
      } else if (riskScore >= this.config.riskScoreThresholds.low) {
        action = 'WARN';
      }

      // Log anomaly if detected
      if (hasAnomaly) {
        await this.logSessionAnomaly(session, anomalyTypes, riskScore, currentRequest);
      }

      return {
        hasAnomaly,
        anomalyType: anomalyTypes,
        riskScore,
        action
      };
    } catch (error) {
      console.error('Session anomaly check error:', error);
      // Fail secure - treat errors as potential security threats
      return {
        hasAnomaly: true,
        anomalyType: ['CHECK_ERROR'],
        riskScore: 75,
        action: 'FORCE_REAUTH'
      };
    }
  }

  /**
   * Check for IP address drift
   * @param {object} session - Session object
   * @param {string} currentIP - Current IP address
   * @returns {Promise<{isDrift: boolean, riskIncrease: number}>}
   */
  static async checkIPDrift(session, currentIP) {
    // Normalize IPs for comparison (handle IPv6 ::ffff: prefix)
    const normalizeIP = (ip) => {
      if (ip?.startsWith('::ffff:')) {
        return ip.substring(7);
      }
      return ip;
    };

    const sessionIP = normalizeIP(session.location?.ipAddress);
    const currentIPNormalized = normalizeIP(currentIP);

    // If IPs match, no drift
    if (sessionIP === currentIPNormalized) {
      return { isDrift: false, riskIncrease: 0 };
    }

    // If IP change is allowed in config (e.g., for mobile users), lower risk
    if (this.config.allowIPChange) {
      return { isDrift: true, riskIncrease: 15 };
    }

    // IP mismatch - high risk
    return { isDrift: true, riskIncrease: 40 };
  }

  /**
   * Check for User Agent drift
   * @param {object} session - Session object
   * @param {string} currentUA - Current User Agent
   * @returns {Promise<{isDrift: boolean, riskIncrease: number}>}
   */
  static async checkUserAgentDrift(session, currentUA) {
    const sessionUA = session.userAgent;

    // If UAs match exactly, no drift
    if (sessionUA === currentUA) {
      return { isDrift: false, riskIncrease: 0 };
    }

    // If strict matching is disabled, check for minor version changes
    if (!this.config.strictUserAgentMatching) {
      // Extract browser and OS info (simplified)
      const extractCoreUA = (ua) => {
        if (!ua) return '';
        // Remove version numbers for comparison
        return ua
          .replace(/\d+\.\d+\.\d+/g, 'X.X.X')
          .replace(/\d+\.\d+/g, 'X.X')
          .replace(/\d+/g, 'X');
      };

      const sessionCore = extractCoreUA(sessionUA);
      const currentCore = extractCoreUA(currentUA);

      // If core UA matches, it's likely just a version update
      if (sessionCore === currentCore) {
        return { isDrift: false, riskIncrease: 0 };
      }
    }

    // Significant User Agent change - potential session hijacking
    return { isDrift: true, riskIncrease: 35 };
  }

  /**
   * Check for impossible travel
   * @param {object} session - Session object
   * @param {object} currentRequest - Current request
   * @returns {Promise<{isImpossible: boolean, riskIncrease: number, distance: number}>}
   */
  static async checkImpossibleTravel(session, currentRequest) {
    // This is a simplified check - in production, you'd use a geolocation service
    // For now, we'll use a basic heuristic
    
    const lastAccessTime = session.activity?.lastAccessAt;
    const timeDiff = Date.now() - new Date(lastAccessTime).getTime();
    const timeDiffMinutes = timeDiff / (1000 * 60);

    // If last access was very recent (< threshold), check if travel is possible
    if (timeDiffMinutes < this.config.impossibleTravelThreshold) {
      // In a real implementation, calculate distance between IPs using geolocation
      // For now, treat same-country as possible, different-country as suspicious
      
      // This would require a geolocation lookup service
      // For this implementation, we'll flag it as medium risk
      return {
        isImpossible: true,
        riskIncrease: 25,
        distance: 0 // Would calculate actual distance
      };
    }

    return {
      isImpossible: false,
      riskIncrease: 0,
      distance: 0
    };
  }

  /**
   * Check for rapid session switching patterns
   * @param {string} userId - User ID
   * @returns {Promise<{isSuspicious: boolean, riskIncrease: number}>}
   */
  static async checkRapidSessionSwitching(userId) {
    try {
      // Count active sessions in the last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const recentSessions = await Session.countDocuments({
        userId,
        status: 'active',
        'activity.lastAccessAt': { $gte: fiveMinutesAgo }
      });

      // If more than 3 active sessions accessed recently, flag as suspicious
      if (recentSessions > 3) {
        return {
          isSuspicious: true,
          riskIncrease: 20
        };
      }

      return {
        isSuspicious: false,
        riskIncrease: 0
      };
    } catch (error) {
      console.error('Rapid session switching check error:', error);
      return {
        isSuspicious: false,
        riskIncrease: 0
      };
    }
  }

  /**
   * Log session anomaly
   * @param {object} session - Session object
   * @param {string[]} anomalyTypes - Types of anomalies detected
   * @param {number} riskScore - Calculated risk score
   * @param {object} currentRequest - Current request
   */
  static async logSessionAnomaly(session, anomalyTypes, riskScore, currentRequest) {
    try {
      const currentIP = currentRequest.ip || currentRequest.connection?.remoteAddress;
      const currentUA = currentRequest.headers?.['user-agent'];

      // Determine severity based on risk score
      let severity = 'low';
      if (riskScore >= this.config.riskScoreThresholds.critical) {
        severity = 'critical';
      } else if (riskScore >= this.config.riskScoreThresholds.high) {
        severity = 'high';
      } else if (riskScore >= this.config.riskScoreThresholds.medium) {
        severity = 'medium';
      }

      // Create security event
      await SecurityEvent.create({
        userId: session.userId,
        eventType: 'SESSION_ANOMALY_DETECTED',
        severity,
        source: 'session_anomaly_detection',
        ipAddress: currentIP,
        userAgent: currentUA,
        details: {
          sessionId: session._id.toString(),
          anomalyTypes: anomalyTypes.join(', '),
          originalIP: session.location?.ipAddress,
          originalUA: session.userAgent,
          reason: `Session anomaly detected: ${anomalyTypes.join(', ')}`
        },
        riskScore,
        timestamp: new Date()
      });

      // Create audit log entry
      await AuditLog.create({
        userId: session.userId,
        action: 'SESSION_ANOMALY_DETECTED',
        category: 'security',
        severity,
        details: {
          sessionId: session._id.toString(),
          anomalyTypes,
          riskScore,
          originalIP: session.location?.ipAddress,
          currentIP,
          originalUA: session.userAgent,
          currentUA
        },
        ipAddress: currentIP,
        userAgent: currentUA,
        timestamp: new Date()
      });

      // Update session with anomaly flags
      if (session.security) {
        session.security.flags = [
          ...(session.security.flags || []),
          ...anomalyTypes
        ];
        session.security.riskScore = Math.max(
          session.security.riskScore || 0,
          riskScore
        );
        await session.save();
      }
    } catch (error) {
      console.error('Error logging session anomaly:', error);
    }
  }

  /**
   * Force session re-authentication
   * @param {string} sessionId - Session ID to invalidate
   * @param {string} reason - Reason for forced re-authentication
   * @returns {Promise<boolean>}
   */
  static async forceReauthentication(sessionId, reason = 'Session anomaly detected') {
    try {
      const session = await Session.findById(sessionId);
      
      if (!session) {
        return false;
      }

      // Revoke the session
      session.status = 'revoked';
      session.revocation = {
        revokedAt: new Date(),
        reason: 'security_concern',
        note: reason
      };
      
      await session.save();

      // Log the forced re-authentication
      await SecurityEvent.create({
        userId: session.userId,
        eventType: 'FORCED_REAUTH',
        severity: 'high',
        source: 'session_anomaly_detection',
        ipAddress: session.location?.ipAddress,
        details: {
          sessionId: session._id.toString(),
          reason
        },
        timestamp: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error forcing re-authentication:', error);
      return false;
    }
  }

  /**
   * Get session anomaly statistics for a user
   * @param {string} userId - User ID
   * @param {number} days - Number of days to look back (default: 30)
   * @returns {Promise<object>}
   */
  static async getAnomalyStatistics(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const events = await SecurityEvent.find({
        userId,
        eventType: 'SESSION_ANOMALY_DETECTED',
        timestamp: { $gte: startDate }
      }).sort({ timestamp: -1 });

      const anomalyTypeCounts = {};
      events.forEach(event => {
        const types = event.details?.anomalyTypes?.split(', ') || [];
        types.forEach(type => {
          anomalyTypeCounts[type] = (anomalyTypeCounts[type] || 0) + 1;
        });
      });

      return {
        totalAnomalies: events.length,
        anomalyTypes: anomalyTypeCounts,
        recentEvents: events.slice(0, 10).map(e => ({
          timestamp: e.timestamp,
          severity: e.severity,
          anomalyTypes: e.details?.anomalyTypes,
          riskScore: e.riskScore
        })),
        averageRiskScore: events.length > 0
          ? events.reduce((sum, e) => sum + (e.riskScore || 0), 0) / events.length
          : 0
      };
    } catch (error) {
      console.error('Error getting anomaly statistics:', error);
      return {
        totalAnomalies: 0,
        anomalyTypes: {},
        recentEvents: [],
        averageRiskScore: 0
      };
    }
  }
}

module.exports = SessionAnomalyDetectionService;
