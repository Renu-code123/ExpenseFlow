const TwoFactorAuth = require('../models/TwoFactorAuth');
const TrustedDevice = require('../models/TrustedDevice');
const SecurityEvent = require('../models/SecurityEvent');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const twoFactorAuthService = require('./twoFactorAuthService');
const suspiciousLoginDetectionService = require('./suspiciousLoginDetectionService');

/**
 * Adaptive MFA Orchestrator
 * Issue #871: Adaptive MFA Orchestrator with Confidence-Aware Challenge Selection
 *
 * Features:
 * - Confidence scoring engine
 * - Multi-modal challenge selection (TOTP, WebAuthn, Push, Knowledge, Biometric)
 * - Challenge friction minimization
 * - Retry penalty escalation
 * - Challenge bypass for high-trust sessions
 * - Risk-based cooldown timers
 * - Audit log of challenge reasoning
 */

class AdaptiveMFAOrchestrator {

  constructor() {
    this.confidenceThresholds = {
      HIGH: 0.8,
      MEDIUM: 0.5,
      LOW: 0.2
    };

    this.challengeTypes = {
      TOTP: 'totp',
      WEBAUTHN: 'webauthn',
      PUSH: 'push',
      KNOWLEDGE: 'knowledge',
      BIOMETRIC: 'biometric'
    };

    this.riskFactors = {
      NEW_DEVICE: 0.3,
      UNUSUAL_LOCATION: 0.4,
      UNUSUAL_TIME: 0.2,
      FAILED_ATTEMPTS: 0.5,
      SUSPICIOUS_ACTIVITY: 0.6,
      ACCOUNT_AGE: -0.2, // Negative for positive factor
      TRUST_HISTORY: -0.3
    };

    this.cooldownTimers = {
      LOW_RISK: 24 * 60 * 60 * 1000, // 24 hours
      MEDIUM_RISK: 60 * 60 * 1000,    // 1 hour
      HIGH_RISK: 5 * 60 * 1000        // 5 minutes
    };
  }

  /**
   * Calculate confidence score for a login attempt
   * @param {string} userId - User ID
   * @param {Object} context - Login context
   * @returns {Promise<{score: number, factors: Object, reasoning: string[]}>}
   */
  async calculateConfidenceScore(userId, context) {
    const factors = {};
    const reasoning = [];

    // Device trust factor
    const deviceTrust = await this.evaluateDeviceTrust(userId, context.deviceFingerprint);
    factors.deviceTrust = deviceTrust.score;
    reasoning.push(deviceTrust.reasoning);

    // Location factor
    const locationTrust = await this.evaluateLocationTrust(userId, context.location);
    factors.locationTrust = locationTrust.score;
    reasoning.push(locationTrust.reasoning);

    // Time factor
    const timeTrust = await this.evaluateTimeTrust(userId, context.timestamp);
    factors.timeTrust = timeTrust.score;
    reasoning.push(timeTrust.reasoning);

    // Recent activity factor
    const activityTrust = await this.evaluateActivityTrust(userId, context);
    factors.activityTrust = activityTrust.score;
    reasoning.push(activityTrust.reasoning);

    // Account age factor
    const accountAge = await this.evaluateAccountAge(userId);
    factors.accountAge = accountAge.score;
    reasoning.push(accountAge.reasoning);

    // Failed attempts factor
    const failedAttempts = await this.evaluateFailedAttempts(userId, context);
    factors.failedAttempts = failedAttempts.score;
    reasoning.push(failedAttempts.reasoning);

    // Calculate weighted score
    const weights = {
      deviceTrust: 0.25,
      locationTrust: 0.20,
      timeTrust: 0.15,
      activityTrust: 0.15,
      accountAge: 0.10,
      failedAttempts: 0.15
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const [factor, weight] of Object.entries(weights)) {
      if (factors[factor] !== undefined) {
        totalScore += factors[factor] * weight;
        totalWeight += weight;
      }
    }

    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0.5;

    return {
      score: Math.max(0, Math.min(1, finalScore)),
      factors,
      reasoning
    };
  }

  /**
   * Evaluate device trust
   */
  async evaluateDeviceTrust(userId, deviceFingerprint) {
    if (!deviceFingerprint) {
      return { score: 0, reasoning: 'No device fingerprint available' };
    }

    const trustedDevice = await TrustedDevice.findOne({
      userId,
      fingerprint: deviceFingerprint,
      isActive: true
    });

    if (!trustedDevice) {
      return { score: 0, reasoning: 'Untrusted device' };
    }

    // Calculate trust based on usage history
    const daysSinceFirstUse = (Date.now() - trustedDevice.firstUsed.getTime()) / (1000 * 60 * 60 * 24);
    const usageCount = trustedDevice.usageCount || 1;
    const daysSinceLastUse = (Date.now() - trustedDevice.lastUsed.getTime()) / (1000 * 60 * 60 * 24);

    let score = 0.5; // Base trust

    // Increase trust for frequent, long-term use
    if (daysSinceFirstUse > 30) score += 0.2;
    if (usageCount > 10) score += 0.2;
    if (daysSinceLastUse < 7) score += 0.1;

    // Decrease trust for very recent additions
    if (daysSinceFirstUse < 1) score -= 0.3;

    return {
      score: Math.max(0, Math.min(1, score)),
      reasoning: `Trusted device with ${usageCount} uses over ${daysSinceFirstUse.toFixed(1)} days`
    };
  }

  /**
   * Evaluate location trust
   */
  async evaluateLocationTrust(userId, location) {
    if (!location || !location.country) {
      return { score: 0.5, reasoning: 'Location data unavailable' };
    }

    // Get user's historical locations
    const recentEvents = await SecurityEvent.find({
      userId,
      eventType: { $in: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] },
      createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } // Last 90 days
    }).sort({ createdAt: -1 }).limit(50);

    const locationHistory = recentEvents
      .filter(event => event.details && event.details.location)
      .map(event => event.details.location.country)
      .filter(Boolean);

    const uniqueCountries = [...new Set(locationHistory)];
    const isKnownCountry = uniqueCountries.includes(location.country);

    if (uniqueCountries.length === 0) {
      return { score: 0.5, reasoning: 'No location history available' };
    }

    if (isKnownCountry) {
      const frequency = locationHistory.filter(c => c === location.country).length / locationHistory.length;
      return {
        score: Math.min(1, 0.7 + frequency * 0.3),
        reasoning: `Known location (${location.country}) used in ${Math.round(frequency * 100)}% of recent logins`
      };
    } else {
      return {
        score: 0.2,
        reasoning: `Unusual location (${location.country}) not in recent history`
      };
    }
  }

  /**
   * Evaluate time trust
   */
  async evaluateTimeTrust(userId, timestamp) {
    if (!timestamp) {
      return { score: 0.5, reasoning: 'Timestamp unavailable' };
    }

    const hour = new Date(timestamp).getHours();

    // Get user's typical login hours
    const recentEvents = await SecurityEvent.find({
      userId,
      eventType: 'LOGIN_SUCCESS',
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    });

    const loginHours = recentEvents.map(event => event.createdAt.getHours());
    const typicalHours = [...new Set(loginHours)];

    if (typicalHours.length === 0) {
      return { score: 0.5, reasoning: 'No login history available' };
    }

    const isTypicalHour = typicalHours.includes(hour);
    const hourFrequency = loginHours.filter(h => h === hour).length / loginHours.length;

    if (isTypicalHour) {
      return {
        score: Math.min(1, 0.6 + hourFrequency * 0.4),
        reasoning: `Login during typical hour (${hour}:00, ${Math.round(hourFrequency * 100)}% of logins)`
      };
    } else {
      return {
        score: 0.3,
        reasoning: `Unusual login hour (${hour}:00) not in typical schedule`
      };
    }
  }

  /**
   * Evaluate activity trust
   */
  async evaluateActivityTrust(userId, context) {
    // Check for suspicious activity patterns
    const suspiciousActivity = await suspiciousLoginDetectionService.detectSuspiciousActivity(userId, context);

    if (suspiciousActivity.isSuspicious) {
      return {
        score: 0.1,
        reasoning: `Suspicious activity detected: ${suspiciousActivity.reasons.join(', ')}`
      };
    }

    // Check recent successful logins
    const recentSuccess = await SecurityEvent.countDocuments({
      userId,
      eventType: 'LOGIN_SUCCESS',
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    });

    if (recentSuccess > 0) {
      return {
        score: 0.8,
        reasoning: `${recentSuccess} successful login(s) in last 24 hours`
      };
    }

    return { score: 0.5, reasoning: 'Normal activity pattern' };
  }

  /**
   * Evaluate account age
   */
  async evaluateAccountAge(userId) {
    const user = await User.findById(userId);
    if (!user || !user.createdAt) {
      return { score: 0.5, reasoning: 'Account age unavailable' };
    }

    const accountAgeDays = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (accountAgeDays < 1) {
      return { score: 0.2, reasoning: 'Very new account (less than 1 day old)' };
    } else if (accountAgeDays < 7) {
      return { score: 0.4, reasoning: `New account (${Math.round(accountAgeDays)} days old)` };
    } else if (accountAgeDays < 30) {
      return { score: 0.6, reasoning: `Recent account (${Math.round(accountAgeDays)} days old)` };
    } else {
      return { score: 0.9, reasoning: `Established account (${Math.round(accountAgeDays)} days old)` };
    }
  }

  /**
   * Evaluate failed attempts
   */
  async evaluateFailedAttempts(userId, context) {
    const recentFailures = await SecurityEvent.countDocuments({
      userId,
      eventType: 'LOGIN_FAILED',
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    });

    if (recentFailures === 0) {
      return { score: 1, reasoning: 'No recent failed attempts' };
    } else if (recentFailures < 3) {
      return {
        score: 0.7,
        reasoning: `${recentFailures} failed attempt(s) in last hour`
      };
    } else {
      return {
        score: Math.max(0, 1 - recentFailures * 0.2),
        reasoning: `${recentFailures} failed attempts in last hour - high risk`
      };
    }
  }

  /**
   * Determine if MFA is required and select appropriate challenge
   * @param {string} userId - User ID
   * @param {Object} context - Login context
   * @returns {Promise<{required: boolean, challenge: Object, confidence: Object, reasoning: string[]}>}
   */
  async determineMFARequirement(userId, context) {
    // Check if user has 2FA enabled
    const twoFAAuth = await TwoFactorAuth.findOne({ userId });
    if (!twoFAAuth || !twoFAAuth.enabled) {
      return {
        required: false,
        challenge: null,
        confidence: { score: 1, factors: {}, reasoning: [] },
        reasoning: ['2FA not enabled for user']
      };
    }

    // Calculate confidence score
    const confidence = await this.calculateConfidenceScore(userId, context);

    // Check for recent bypass
    const recentBypass = await this.checkRecentBypass(userId, context);
    if (recentBypass.canBypass) {
      await this.logChallengeDecision(userId, 'BYPASS', confidence, context, ['Recent successful bypass']);
      return {
        required: false,
        challenge: null,
        confidence,
        reasoning: [`Bypassed due to: ${recentBypass.reason}`]
      };
    }

    // Determine risk level
    let riskLevel = 'LOW';
    if (confidence.score >= this.confidenceThresholds.HIGH) {
      riskLevel = 'LOW';
    } else if (confidence.score >= this.confidenceThresholds.MEDIUM) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'HIGH';
    }

    // Select appropriate challenge based on risk and available methods
    const challenge = await this.selectChallenge(userId, riskLevel, twoFAAuth, context);

    const reasoning = [
      `Confidence score: ${(confidence.score * 100).toFixed(1)}% (${riskLevel} risk)`,
      `Selected challenge: ${challenge.type}`,
      ...confidence.reasoning
    ];

    await this.logChallengeDecision(userId, 'CHALLENGE', confidence, context, reasoning);

    return {
      required: true,
      challenge,
      confidence,
      reasoning
    };
  }

  /**
   * Check for recent bypass eligibility
   */
  async checkRecentBypass(userId, context) {
    const recentChallenge = await AuditLog.findOne({
      userId,
      action: { $in: ['MFA_CHALLENGE_SUCCESS', 'MFA_BYPASS'] },
      'details.deviceFingerprint': context.deviceFingerprint,
      createdAt: { $gte: new Date(Date.now() - this.cooldownTimers.LOW_RISK) }
    }).sort({ createdAt: -1 });

    if (!recentChallenge) {
      return { canBypass: false, reason: 'No recent successful challenge' };
    }

    const timeSinceLastChallenge = Date.now() - recentChallenge.createdAt.getTime();
    const riskLevel = recentChallenge.details?.riskLevel || 'MEDIUM';
    const cooldownTime = this.cooldownTimers[riskLevel] || this.cooldownTimers.MEDIUM_RISK;

    if (timeSinceLastChallenge < cooldownTime) {
      return {
        canBypass: true,
        reason: `Recent ${recentChallenge.action.toLowerCase()} ${Math.round(timeSinceLastChallenge / (1000 * 60))} minutes ago`
      };
    }

    return { canBypass: false, reason: 'Cooldown period expired' };
  }

  /**
   * Select appropriate challenge based on risk level and available methods
   */
  async selectChallenge(userId, riskLevel, twoFAAuth, context) {
    const availableMethods = await this.getAvailableMethods(userId, twoFAAuth);

    // Challenge selection logic based on risk level
    switch (riskLevel) {
      case 'LOW':
        // Prefer low-friction methods for low risk
        if (availableMethods.includes('push')) {
          return { type: 'push', method: 'push', friction: 'low' };
        }
        if (availableMethods.includes('biometric')) {
          return { type: 'biometric', method: 'biometric', friction: 'low' };
        }
        if (availableMethods.includes('webauthn')) {
          return { type: 'webauthn', method: 'webauthn', friction: 'medium' };
        }
        // Fall back to TOTP
        return { type: 'totp', method: 'totp', friction: 'medium' };

      case 'MEDIUM':
        // Balanced approach
        if (availableMethods.includes('webauthn')) {
          return { type: 'webauthn', method: 'webauthn', friction: 'medium' };
        }
        if (availableMethods.includes('push')) {
          return { type: 'push', method: 'push', friction: 'low' };
        }
        return { type: 'totp', method: 'totp', friction: 'medium' };

      case 'HIGH':
        // High friction for high risk
        if (availableMethods.includes('knowledge')) {
          return { type: 'knowledge', method: 'knowledge', friction: 'high' };
        }
        return { type: 'totp', method: 'totp', friction: 'medium' };

      default:
        return { type: 'totp', method: 'totp', friction: 'medium' };
    }
  }

  /**
   * Get available MFA methods for user
   */
  async getAvailableMethods(userId, twoFAAuth) {
    const methods = [];

    // Always include TOTP if enabled
    if (twoFAAuth.totpSecret) {
      methods.push('totp');
    }

    // Check for WebAuthn
    if (twoFAAuth.webauthnCredentials && twoFAAuth.webauthnCredentials.length > 0) {
      methods.push('webauthn');
    }

    // Check for push notifications (simulated)
    if (twoFAAuth.pushEnabled) {
      methods.push('push');
    }

    // Check for knowledge-based auth
    if (twoFAAuth.knowledgeQuestions && twoFAAuth.knowledgeQuestions.length > 0) {
      methods.push('knowledge');
    }

    // Check for biometric (device capability)
    if (twoFAAuth.biometricEnabled) {
      methods.push('biometric');
    }

    return methods;
  }

  /**
   * Log challenge decision for audit
   */
  async logChallengeDecision(userId, decision, confidence, context, reasoning) {
    await AuditLog.create({
      userId,
      action: decision === 'BYPASS' ? 'MFA_BYPASS' : 'MFA_CHALLENGE_SELECTED',
      actionType: 'security',
      resourceType: 'AdaptiveMFA',
      details: {
        confidenceScore: confidence.score,
        riskLevel: this.getRiskLevel(confidence.score),
        deviceFingerprint: context.deviceFingerprint,
        location: context.location,
        reasoning: reasoning,
        decision: decision
      }
    });
  }

  /**
   * Get risk level from confidence score
   */
  getRiskLevel(score) {
    if (score >= this.confidenceThresholds.HIGH) return 'LOW';
    if (score >= this.confidenceThresholds.MEDIUM) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Handle MFA challenge verification with adaptive logic
   */
  async verifyChallenge(userId, challengeType, challengeData, context) {
    const result = {
      success: false,
      reasoning: [],
      nextAction: null
    };

    // Get user's MFA settings
    const twoFAAuth = await TwoFactorAuth.findOne({ userId });
    if (!twoFAAuth || !twoFAAuth.enabled) {
      result.reasoning.push('2FA not enabled');
      return result;
    }

    // Verify the challenge
    const verificationResult = await this.verifyChallengeByType(userId, challengeType, challengeData, twoFAAuth);

    if (verificationResult.success) {
      result.success = true;
      result.reasoning.push(`Successfully verified ${challengeType} challenge`);

      // Log successful challenge
      await AuditLog.create({
        userId,
        action: 'MFA_CHALLENGE_SUCCESS',
        actionType: 'security',
        resourceType: 'AdaptiveMFA',
        details: {
          challengeType,
          deviceFingerprint: context.deviceFingerprint,
          location: context.location
        }
      });

      // Update device trust if applicable
      if (context.deviceFingerprint) {
        await this.updateDeviceTrust(userId, context.deviceFingerprint, true);
      }

    } else {
      result.success = false;
      result.reasoning.push(`Failed ${challengeType} challenge: ${verificationResult.reason}`);

      // Handle failed attempt
      const penalty = await this.handleFailedAttempt(userId, challengeType, context);
      result.nextAction = penalty.nextAction;
      result.reasoning.push(...penalty.reasoning);

      // Log failed challenge
      await AuditLog.create({
        userId,
        action: 'MFA_CHALLENGE_FAILED',
        actionType: 'security',
        resourceType: 'AdaptiveMFA',
        details: {
          challengeType,
          reason: verificationResult.reason,
          deviceFingerprint: context.deviceFingerprint,
          location: context.location,
          penalty: penalty.nextAction
        }
      });
    }

    return result;
  }

  /**
   * Verify challenge by type
   */
  async verifyChallengeByType(userId, challengeType, challengeData, twoFAAuth) {
    switch (challengeType) {
      case 'totp':
        return await twoFactorAuthService.verifyTOTP(userId, challengeData.code);

      case 'webauthn':
        // WebAuthn verification would be implemented here
        return { success: false, reason: 'WebAuthn not yet implemented' };

      case 'push':
        // Push notification verification would be implemented here
        return { success: false, reason: 'Push notifications not yet implemented' };

      case 'knowledge':
        // Knowledge-based verification would be implemented here
        return { success: false, reason: 'Knowledge-based auth not yet implemented' };

      case 'biometric':
        // Biometric verification would be implemented here
        return { success: false, reason: 'Biometric auth not yet implemented' };

      default:
        return { success: false, reason: 'Unknown challenge type' };
    }
  }

  /**
   * Handle failed MFA attempt with penalty escalation
   */
  async handleFailedAttempt(userId, challengeType, context) {
    // Get recent failures
    const recentFailures = await AuditLog.countDocuments({
      userId,
      action: 'MFA_CHALLENGE_FAILED',
      'details.challengeType': challengeType,
      createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) } // Last 15 minutes
    });

    const penalty = {
      nextAction: null,
      reasoning: []
    };

    if (recentFailures === 0) {
      penalty.reasoning.push('First failed attempt - no penalty');
    } else if (recentFailures === 1) {
      penalty.nextAction = 'retry';
      penalty.reasoning.push('Second failed attempt - allow retry with TOTP fallback');
    } else if (recentFailures === 2) {
      penalty.nextAction = 'cooldown';
      penalty.cooldownMinutes = 5;
      penalty.reasoning.push('Third failed attempt - 5 minute cooldown');
    } else {
      penalty.nextAction = 'lockout';
      penalty.reasoning.push('Multiple failed attempts - temporary lockout');
    }

    return penalty;
  }

  /**
   * Update device trust based on successful verification
   */
  async updateDeviceTrust(userId, deviceFingerprint, success) {
    if (!deviceFingerprint) return;

    let device = await TrustedDevice.findOne({
      userId,
      fingerprint: deviceFingerprint
    });

    if (!device) {
      device = new TrustedDevice({
        userId,
        fingerprint: deviceFingerprint,
        firstUsed: new Date(),
        isActive: true
      });
    }

    device.lastUsed = new Date();
    device.usageCount = (device.usageCount || 0) + 1;

    if (success) {
      device.consecutiveSuccesses = (device.consecutiveSuccesses || 0) + 1;
      device.consecutiveFailures = 0;
    } else {
      device.consecutiveFailures = (device.consecutiveFailures || 0) + 1;
      device.consecutiveSuccesses = 0;
    }

    await device.save();
  }
}

module.exports = new AdaptiveMFAOrchestrator();