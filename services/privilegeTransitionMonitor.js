/**
 * Zero-Trust Privilege Transition Monitor
 * Issue #872: Real-Time Privilege Transition Monitoring
 *
 * Monitors privilege transitions within session lifecycle and enforces
 * zero-trust controls including re-scoring, re-authentication, and JIT expiry.
 */

const Session = require('../models/Session');
const SessionTrustScore = require('../models/SessionTrustScore');
const SessionBehaviorSignal = require('../models/SessionBehaviorSignal');
const AuditLog = require('../models/AuditLog');
const ContinuousSessionTrustService = require('./continuousSessionTrustService');
const ChallengeOrchestrationService = require('./challengeOrchestrationService');
const securityMonitor = require('./securityMonitor');
const AppEventBus = require('../utils/AppEventBus');
const EVENTS = require('../config/eventRegistry');

class PrivilegeTransitionMonitor {

  constructor() {
    this.monitoredEvents = [
      'ROLE_UPGRADE',
      'ADMIN_ENDPOINT_ACCESS',
      'DATA_EXPORT_INITIATION',
      'PAYMENT_CHANGE',
      'CONFIGURATION_CHANGE'
    ];

    this.privilegeTiers = {
      BASIC: 1,
      EDITOR: 2,
      MANAGER: 3,
      ADMIN: 4,
      SECURITY_ADMIN: 5
    };

    this.jitExpiryTimeouts = new Map(); // sessionId -> timeout
    this.activeElevations = new Map(); // sessionId -> elevation data

    this.initializeEventListeners();
  }

  /**
   * Initialize event listeners for privilege transitions
   */
  initializeEventListeners() {
    // Listen for role changes
    AppEventBus.on(EVENTS.USER_ROLE_CHANGED, this.handleRoleUpgrade.bind(this));

    // Listen for sensitive endpoint access
    AppEventBus.on(EVENTS.ADMIN_ENDPOINT_ACCESSED, this.handleAdminEndpointAccess.bind(this));

    // Listen for data export initiation
    AppEventBus.on(EVENTS.DATA_EXPORT_INITIATED, this.handleDataExportInitiation.bind(this));

    // Listen for payment changes
    AppEventBus.on(EVENTS.PAYMENT_MODIFIED, this.handlePaymentChange.bind(this));

    // Listen for configuration changes
    AppEventBus.on(EVENTS.CONFIGURATION_MODIFIED, this.handleConfigurationChange.bind(this));
  }

  /**
   * Monitor privilege transition for a request
   */
  async monitorTransition(sessionId, userId, requestContext, user) {
    try {
      const transition = await this.detectPrivilegeTransition(sessionId, userId, requestContext, user);

      if (transition) {
        await this.handlePrivilegeTransition(sessionId, userId, transition, requestContext);
      }

      return transition;
    } catch (error) {
      console.error('Error monitoring privilege transition:', error);
      return null;
    }
  }

  /**
   * Detect if a privilege transition occurred
   */
  async detectPrivilegeTransition(sessionId, userId, requestContext, user) {
    const currentRole = user?.role || 'USER';
    const requiredRole = requestContext.requiredRole;
    const endpoint = requestContext.endpoint;
    const action = requestContext.action;

    // Check for role-based transitions
    if (requiredRole && this.isPrivilegeEscalation(currentRole, requiredRole)) {
      return {
        type: 'ROLE_UPGRADE',
        previousRole: currentRole,
        newRole: requiredRole,
        escalationLevel: this.calculateEscalationLevel(currentRole, requiredRole)
      };
    }

    // Check for admin endpoint access
    if (this.isAdminEndpoint(endpoint)) {
      return {
        type: 'ADMIN_ENDPOINT_ACCESS',
        endpoint: endpoint,
        sensitivity: this.getEndpointSensitivity(endpoint)
      };
    }

    // Check for data export initiation
    if (action === 'EXPORT_DATA' || endpoint.includes('/export')) {
      return {
        type: 'DATA_EXPORT_INITIATION',
        endpoint: endpoint,
        dataType: requestContext.dataType || 'unknown'
      };
    }

    // Check for payment modifications
    if (action === 'MODIFY_PAYMENT' || endpoint.includes('/payments') && requestContext.method !== 'GET') {
      return {
        type: 'PAYMENT_CHANGE',
        endpoint: endpoint,
        changeType: requestContext.changeType || 'modification'
      };
    }

    // Check for configuration changes
    if (action === 'MODIFY_CONFIG' || endpoint.includes('/config') || endpoint.includes('/settings')) {
      return {
        type: 'CONFIGURATION_CHANGE',
        endpoint: endpoint,
        configType: requestContext.configType || 'general'
      };
    }

    return null;
  }

  /**
   * Handle detected privilege transition
   */
  async handlePrivilegeTransition(sessionId, userId, transition, requestContext) {
    // Log the privilege transition
    await this.logPrivilegeTransition(sessionId, userId, transition, requestContext);

    // Trigger immediate trust re-scoring
    await this.triggerTrustRescoring(sessionId, userId, transition);

    // Evaluate enforcement actions
    await this.evaluateEnforcementActions(sessionId, userId, transition, requestContext);

    // Set up JIT privilege expiry if needed
    await this.setupJITPrivilegeExpiry(sessionId, transition);

    // Emit event for monitoring systems
    AppEventBus.emit(EVENTS.PRIVILEGE_TRANSITION_DETECTED, {
      sessionId,
      userId,
      transition,
      timestamp: new Date()
    });
  }

  /**
   * Check if role change is a privilege escalation
   */
  isPrivilegeEscalation(currentRole, requiredRole) {
    const currentTier = this.privilegeTiers[currentRole] || 1;
    const requiredTier = this.privilegeTiers[requiredRole] || 1;

    return requiredTier > currentTier;
  }

  /**
   * Calculate escalation level
   */
  calculateEscalationLevel(fromRole, toRole) {
    const fromTier = this.privilegeTiers[fromRole] || 1;
    const toTier = this.privilegeTiers[toRole] || 1;

    return Math.max(0, toTier - fromTier);
  }

  /**
   * Check if endpoint is admin-level
   */
  isAdminEndpoint(endpoint) {
    const adminPatterns = [
      '/api/admin',
      '/api/security',
      '/api/audit',
      '/api/users',
      '/api/tenants',
      '/api/system'
    ];

    return adminPatterns.some(pattern => endpoint.includes(pattern));
  }

  /**
   * Get endpoint sensitivity level
   */
  getEndpointSensitivity(endpoint) {
    if (endpoint.includes('/admin/tenants') || endpoint.includes('/system')) {
      return 'CRITICAL';
    }
    if (endpoint.includes('/admin') || endpoint.includes('/security')) {
      return 'HIGH';
    }
    if (endpoint.includes('/users') || endpoint.includes('/audit')) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Log privilege transition to audit trail
   */
  async logPrivilegeTransition(sessionId, userId, transition, requestContext) {
    try {
      const auditEntry = new AuditLog({
        userId,
        sessionId,
        action: 'PRIVILEGE_TRANSITION',
        resource: transition.type,
        details: {
          transition,
          endpoint: requestContext.endpoint,
          method: requestContext.method,
          ipAddress: requestContext.ipAddress,
          userAgent: requestContext.userAgent,
          timestamp: new Date()
        },
        severity: this.getTransitionSeverity(transition),
        source: 'PRIVILEGE_TRANSITION_MONITOR'
      });

      await auditEntry.save();

      // Also log to security monitor
      await securityMonitor.logSecurityEvent({
        type: 'PRIVILEGE_TRANSITION',
        severity: this.getTransitionSeverity(transition),
        sessionId,
        userId,
        details: transition,
        source: 'PrivilegeTransitionMonitor'
      });

    } catch (error) {
      console.error('Error logging privilege transition:', error);
    }
  }

  /**
   * Get severity level for transition
   */
  getTransitionSeverity(transition) {
    switch (transition.type) {
      case 'ROLE_UPGRADE':
        return transition.escalationLevel >= 3 ? 'CRITICAL' : 'HIGH';
      case 'ADMIN_ENDPOINT_ACCESS':
        return transition.sensitivity === 'CRITICAL' ? 'CRITICAL' : 'HIGH';
      case 'DATA_EXPORT_INITIATION':
        return 'MEDIUM';
      case 'PAYMENT_CHANGE':
      case 'CONFIGURATION_CHANGE':
        return 'HIGH';
      default:
        return 'LOW';
    }
  }

  /**
   * Trigger immediate trust re-scoring
   */
  async triggerTrustRescoring(sessionId, userId, transition) {
    try {
      // Force immediate re-scoring
      await ContinuousSessionTrustService.performTrustReScoring(sessionId, userId, {
        trigger: 'PRIVILEGE_TRANSITION',
        transitionType: transition.type,
        escalationLevel: transition.escalationLevel || 1
      });

      // Create behavior signal for the transition
      const signal = new SessionBehaviorSignal({
        sessionId,
        userId,
        signalType: 'PRIVILEGE_TRANSITION',
        severity: this.getTransitionSeverity(transition),
        trustImpact: this.calculateTrustImpact(transition),
        confidence: 95,
        details: transition,
        detectedAt: new Date()
      });

      await signal.save();

    } catch (error) {
      console.error('Error triggering trust rescoring:', error);
    }
  }

  /**
   * Calculate trust impact of transition
   */
  calculateTrustImpact(transition) {
    switch (transition.type) {
      case 'ROLE_UPGRADE':
        return -10 * (transition.escalationLevel || 1);
      case 'ADMIN_ENDPOINT_ACCESS':
        return transition.sensitivity === 'CRITICAL' ? -30 : -15;
      case 'DATA_EXPORT_INITIATION':
        return -10;
      case 'PAYMENT_CHANGE':
        return -20;
      case 'CONFIGURATION_CHANGE':
        return -15;
      default:
        return -5;
    }
  }

  /**
   * Evaluate and apply enforcement actions
   */
  async evaluateEnforcementActions(sessionId, userId, transition, requestContext) {
    const trustScore = await this.getCurrentTrustScore(sessionId);

    // Determine required actions based on transition type and trust score
    const actions = this.determineEnforcementActions(transition, trustScore);

    for (const action of actions) {
      await this.executeEnforcementAction(sessionId, userId, action, transition, requestContext);
    }
  }

  /**
   * Get current trust score for session
   */
  async getCurrentTrustScore(sessionId) {
    try {
      const trustScore = await SessionTrustScore.findOne({ sessionId }).sort({ calculatedAt: -1 });
      return trustScore ? trustScore.overallScore : 100;
    } catch (error) {
      console.error('Error getting current trust score:', error);
      return 100; // Default to high trust
    }
  }

  /**
   * Determine required enforcement actions
   */
  determineEnforcementActions(transition, trustScore) {
    const actions = [];

    // Always log elevated actions
    actions.push('LOG_ELEVATED_ACTION');

    // Re-scoring already triggered above
    if (trustScore < 70) {
      actions.push('CONDITIONAL_REAUTH');
    }

    // Critical transitions require immediate verification
    if (this.isCriticalTransition(transition)) {
      actions.push('IMMEDIATE_CHALLENGE');
    }

    // Set up JIT expiry for elevated privileges
    if (this.requiresJITExpiry(transition)) {
      actions.push('JIT_PRIVILEGE_EXPIRY');
    }

    return actions;
  }

  /**
   * Check if transition is critical
   */
  isCriticalTransition(transition) {
    return (
      (transition.type === 'ROLE_UPGRADE' && transition.escalationLevel >= 3) ||
      (transition.type === 'ADMIN_ENDPOINT_ACCESS' && transition.sensitivity === 'CRITICAL') ||
      transition.type === 'CONFIGURATION_CHANGE'
    );
  }

  /**
   * Check if transition requires JIT expiry
   */
  requiresJITExpiry(transition) {
    return (
      transition.type === 'ROLE_UPGRADE' ||
      transition.type === 'ADMIN_ENDPOINT_ACCESS' ||
      transition.type === 'CONFIGURATION_CHANGE'
    );
  }

  /**
   * Execute enforcement action
   */
  async executeEnforcementAction(sessionId, userId, action, transition, requestContext) {
    switch (action) {
      case 'LOG_ELEVATED_ACTION':
        // Already logged above
        break;

      case 'CONDITIONAL_REAUTH':
        await this.triggerConditionalReauth(sessionId, userId, transition);
        break;

      case 'IMMEDIATE_CHALLENGE':
        await this.triggerImmediateChallenge(sessionId, userId, transition);
        break;

      case 'JIT_PRIVILEGE_EXPIRY':
        await this.setupJITPrivilegeExpiry(sessionId, transition);
        break;
    }
  }

  /**
   * Trigger conditional re-authentication
   */
  async triggerConditionalReauth(sessionId, userId, transition) {
    try {
      // Create a challenge for re-authentication
      await ChallengeOrchestrationService.createChallenge(sessionId, {
        type: 'REAUTH',
        reason: `Privilege transition: ${transition.type}`,
        severity: 'HIGH',
        context: transition
      });

    } catch (error) {
      console.error('Error triggering conditional reauth:', error);
    }
  }

  /**
   * Trigger immediate identity challenge
   */
  async triggerImmediateChallenge(sessionId, userId, transition) {
    try {
      // Create high-priority challenge
      await ChallengeOrchestrationService.createChallenge(sessionId, {
        type: 'IDENTITY_VERIFICATION',
        reason: `Critical privilege transition: ${transition.type}`,
        severity: 'CRITICAL',
        context: transition,
        priority: 'IMMEDIATE'
      });

    } catch (error) {
      console.error('Error triggering immediate challenge:', error);
    }
  }

  /**
   * Set up Just-In-Time privilege expiry
   */
  async setupJITPrivilegeExpiry(sessionId, transition) {
    const expiryTime = this.calculateJITExpiryTime(transition);

    // Clear any existing timeout for this session
    if (this.jitExpiryTimeouts.has(sessionId)) {
      clearTimeout(this.jitExpiryTimeouts.get(sessionId));
    }

    // Set up new expiry timeout
    const timeout = setTimeout(async () => {
      await this.expireJITPrivilege(sessionId, transition);
    }, expiryTime);

    this.jitExpiryTimeouts.set(sessionId, timeout);

    // Store elevation data
    this.activeElevations.set(sessionId, {
      transition,
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + expiryTime),
      expiryTime
    });

    // Log JIT privilege grant
    await this.logJITPrivilegeGrant(sessionId, transition, expiryTime);
  }

  /**
   * Calculate JIT expiry time based on transition
   */
  calculateJITExpiryTime(transition) {
    const baseTime = 15 * 60 * 1000; // 15 minutes base

    let multiplier = 1;

    switch (transition.type) {
      case 'ROLE_UPGRADE':
        multiplier = transition.escalationLevel || 1;
        break;
      case 'ADMIN_ENDPOINT_ACCESS':
        multiplier = transition.sensitivity === 'CRITICAL' ? 4 : 2;
        break;
      case 'CONFIGURATION_CHANGE':
        multiplier = 3;
        break;
      case 'PAYMENT_CHANGE':
        multiplier = 2;
        break;
      case 'DATA_EXPORT_INITIATION':
        multiplier = 1.5;
        break;
    }

    return Math.min(baseTime * multiplier, 2 * 60 * 60 * 1000); // Max 2 hours
  }

  /**
   * Expire JIT privilege
   */
  async expireJITPrivilege(sessionId, transition) {
    try {
      // Remove from active elevations
      this.activeElevations.delete(sessionId);

      // Clear timeout
      if (this.jitExpiryTimeouts.has(sessionId)) {
        clearTimeout(this.jitExpiryTimeouts.get(sessionId));
        this.jitExpiryTimeouts.delete(sessionId);
      }

      // Update session to revoke elevated privileges
      await Session.updateOne(
        { _id: sessionId },
        {
          $set: {
            'elevatedPrivileges.active': false,
            'elevatedPrivileges.expiredAt': new Date()
          }
        }
      );

      // Log expiry
      await this.logJITPrivilegeExpiry(sessionId, transition);

      // Emit event
      AppEventBus.emit(EVENTS.JIT_PRIVILEGE_EXPIRED, {
        sessionId,
        transition,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error expiring JIT privilege:', error);
    }
  }

  /**
   * Log JIT privilege grant
   */
  async logJITPrivilegeGrant(sessionId, transition, expiryTime) {
    try {
      const auditEntry = new AuditLog({
        sessionId,
        action: 'JIT_PRIVILEGE_GRANTED',
        resource: transition.type,
        details: {
          transition,
          expiryTime,
          grantedAt: new Date(),
          expiresAt: new Date(Date.now() + expiryTime)
        },
        severity: 'MEDIUM',
        source: 'PRIVILEGE_TRANSITION_MONITOR'
      });

      await auditEntry.save();
    } catch (error) {
      console.error('Error logging JIT privilege grant:', error);
    }
  }

  /**
   * Log JIT privilege expiry
   */
  async logJITPrivilegeExpiry(sessionId, transition) {
    try {
      const auditEntry = new AuditLog({
        sessionId,
        action: 'JIT_PRIVILEGE_EXPIRED',
        resource: transition.type,
        details: {
          transition,
          expiredAt: new Date()
        },
        severity: 'LOW',
        source: 'PRIVILEGE_TRANSITION_MONITOR'
      });

      await auditEntry.save();
    } catch (error) {
      console.error('Error logging JIT privilege expiry:', error);
    }
  }

  /**
   * Event handlers for specific transition types
   */
  async handleRoleUpgrade(data) {
    const { sessionId, userId, oldRole, newRole } = data;

    const transition = {
      type: 'ROLE_UPGRADE',
      previousRole: oldRole,
      newRole: newRole,
      escalationLevel: this.calculateEscalationLevel(oldRole, newRole)
    };

    await this.handlePrivilegeTransition(sessionId, userId, transition, {
      endpoint: '/api/users/role',
      method: 'PATCH'
    });
  }

  async handleAdminEndpointAccess(data) {
    const { sessionId, userId, endpoint } = data;

    const transition = {
      type: 'ADMIN_ENDPOINT_ACCESS',
      endpoint: endpoint,
      sensitivity: this.getEndpointSensitivity(endpoint)
    };

    await this.handlePrivilegeTransition(sessionId, userId, transition, {
      endpoint,
      method: data.method || 'GET'
    });
  }

  async handleDataExportInitiation(data) {
    const { sessionId, userId, endpoint, dataType } = data;

    const transition = {
      type: 'DATA_EXPORT_INITIATION',
      endpoint: endpoint,
      dataType: dataType
    };

    await this.handlePrivilegeTransition(sessionId, userId, transition, {
      endpoint,
      method: 'POST',
      dataType
    });
  }

  async handlePaymentChange(data) {
    const { sessionId, userId, endpoint, changeType } = data;

    const transition = {
      type: 'PAYMENT_CHANGE',
      endpoint: endpoint,
      changeType: changeType
    };

    await this.handlePrivilegeTransition(sessionId, userId, transition, {
      endpoint,
      method: 'PUT',
      changeType
    });
  }

  async handleConfigurationChange(data) {
    const { sessionId, userId, endpoint, configType } = data;

    const transition = {
      type: 'CONFIGURATION_CHANGE',
      endpoint: endpoint,
      configType: configType
    };

    await this.handlePrivilegeTransition(sessionId, userId, transition, {
      endpoint,
      method: 'PUT',
      configType
    });
  }

  /**
   * Get active elevations for monitoring/SOC dashboard
   */
  getActiveElevations() {
    return Array.from(this.activeElevations.entries()).map(([sessionId, data]) => ({
      sessionId,
      ...data
    }));
  }

  /**
   * Get privilege transition statistics
   */
  async getTransitionStatistics(timeframe = '24h') {
    try {
      const since = new Date(Date.now() - this.parseTimeframe(timeframe));

      const stats = await AuditLog.aggregate([
        {
          $match: {
            action: 'PRIVILEGE_TRANSITION',
            createdAt: { $gte: since }
          }
        },
        {
          $group: {
            _id: '$details.transition.type',
            count: { $sum: 1 },
            severities: { $push: '$severity' }
          }
        }
      ]);

      return stats;
    } catch (error) {
      console.error('Error getting transition statistics:', error);
      return [];
    }
  }

  /**
   * Parse timeframe string to milliseconds
   */
  parseTimeframe(timeframe) {
    const unit = timeframe.slice(-1);
    const value = parseInt(timeframe.slice(0, -1));

    switch (unit) {
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'm': return value * 30 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000; // Default 24h
    }
  }

  /**
   * Clean up expired timeouts (maintenance)
   */
  cleanup() {
    for (const [sessionId, timeout] of this.jitExpiryTimeouts) {
      if (!this.activeElevations.has(sessionId)) {
        clearTimeout(timeout);
        this.jitExpiryTimeouts.delete(sessionId);
      }
    }
  }
}

module.exports = new PrivilegeTransitionMonitor();