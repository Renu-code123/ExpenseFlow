const SecurityEvent = require('../models/SecurityEvent');
const DeviceFingerprint = require('../models/DeviceFingerprint');
const TrustedDevice = require('../models/TrustedDevice');
const User = require('../models/User');

/**
 * Suspicious Login Detection Service
 * Issue #504: Security Requirements
 * 
 * Detects and flags suspicious login attempts based on:
 * - Device fingerprint mismatches
 * - Geographic anomalies (impossible travel)
 * - Velocity anomalies (too many attempts too quickly)
 * - Brute force patterns
 * - Failed 2FA attempts
 * - New devices/locations
 */

class SuspiciousLoginDetectionService {
  /**
   * Analyze login attempt for suspicious activity
   * @param {string} userId - User ID
   * @param {object} loginInfo - Login information
   * @returns {Promise<{isSuspicious: boolean, riskScore: number, flags: string[]}>}
   */
  async analyzeLoginAttempt(userId, loginInfo) {
    try {
      const flags = [];
      let riskScore = 0;

      const {
        ipAddress,
        userAgent,
        deviceFingerprint,
        location,
        sessionId
      } = loginInfo;

      // Check device fingerprint
      const deviceCheck = await this.checkDeviceFingerprint(userId, deviceFingerprint, ipAddress);
      if (deviceCheck.flagged) {
        flags.push('DEVICE_FINGERPRINT_MISMATCH');
        riskScore += deviceCheck.riskIncrease;
      }

      // Check geographic anomalies
      const geoCheck = await this.checkGeographicAnomaly(userId, location);
      if (geoCheck.isAnomaly) {
        flags.push('GEOGRAPHIC_ANOMALY');
        riskScore += 25;

        // Critical if impossible travel speed
        if (geoCheck.speedRequired > 900) {
          flags.push('IMPOSSIBLE_TRAVEL');
          riskScore += 30;
        }
      }

      // Check velocity anomalies
      const velocityCheck = await SecurityEvent.checkVelocityAnomaly(userId);
      if (velocityCheck) {
        flags.push('VELOCITY_ANOMALY');
        riskScore += 20;
      }

      // Check for recent failed attempts
      const failedAttempts = await SecurityEvent.count2FAFailures(userId, 10);
      if (failedAttempts >= 3) {
        flags.push('MULTIPLE_FAILED_ATTEMPTS');
        riskScore += 15;
      }

      // Log the security event
      const eventType = riskScore >= 70 ? 'SUSPICIOUS_LOGIN' : 'LOGIN_ATTEMPT';
      
      await SecurityEvent.logEvent({
        userId,
        eventType,
        severity: riskScore >= 85 ? 'critical' : (riskScore >= 70 ? 'high' : 'medium'),
        source: 'login_analysis',
        ipAddress,
        userAgent,
        deviceFingerprint,
        location,
        details: {
          attemptNumber: 1,
          flagsTriggered: flags
        },
        riskScore,
        action: riskScore >= 85 ? 'challenged' : 'allowed'
      });

      return {
        isSuspicious: riskScore >= 70,
        requiresChallenge: riskScore >= 85,
        riskScore: Math.min(100, riskScore),
        flags
      };
    } catch (error) {
      console.error('Error analyzing login attempt:', error);
      throw error;
    }
  }

  /**
   * Check device fingerprint against known devices
   */
  async checkDeviceFingerprint(userId, deviceFingerprint, ipAddress) {
    try {
      if (!deviceFingerprint) {
        return { flagged: false, riskIncrease: 0 };
      }

      // Find existing device fingerprint
      const existingDevice = await DeviceFingerprint.findOne({
        user: userId,
        fingerprint: deviceFingerprint
      });

      if (!existingDevice) {
        // New device detected
        const newDevice = await DeviceFingerprint.create({
          user: userId,
          fingerprint: deviceFingerprint,
          status: 'suspicious'
        });

        return {
          flagged: true,
          riskIncrease: 15,
          reason: 'NEW_DEVICE',
          device: newDevice
        };
      }

      // Check if device status is as expected
      if (existingDevice.status === 'blocked') {
        return {
          flagged: true,
          riskIncrease: 50,
          reason: 'BLOCKED_DEVICE'
        };
      }

      if (existingDevice.status === 'suspicious') {
        return {
          flagged: true,
          riskIncrease: 25,
          reason: 'SUSPICIOUS_DEVICE'
        };
      }

      // Check for IP mismatch if device was previously used
      if (existingDevice.lastSeen && existingDevice.lastSeen > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
        // Device was used in last 7 days
        if (existingDevice.networkInfo?.ipAddress !== ipAddress) {
          // Update last seen for good standing device
          existingDevice.lastSeen = new Date();
          existingDevice.loginCount = (existingDevice.loginCount || 0) + 1;
          await existingDevice.save();

          return {
            flagged: false,
            riskIncrease: 5,
            reason: 'NEW_NETWORK'
          };
        }
      }

      // Update device usage
      existingDevice.lastSeen = new Date();
      existingDevice.loginCount = (existingDevice.loginCount || 0) + 1;
      if (existingDevice.trustScore < 1) {
        existingDevice.trustScore += 0.05;
      }
      await existingDevice.save();

      return { flagged: false, riskIncrease: 0 };
    } catch (error) {
      console.error('Error checking device fingerprint:', error);
      return { flagged: false, riskIncrease: 0 };
    }
  }

  /**
   * Check for geographic anomalies (impossible travel)
   */
  async checkGeographicAnomaly(userId, newLocation) {
    try {
      const result = await SecurityEvent.checkGeographicAnomaly(userId);
      return result;
    } catch (error) {
      console.error('Error checking geographic anomaly:', error);
      return { isAnomaly: false };
    }
  }

  /**
   * Validate session after 2FA success
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @param {object} loginInfo - Original login information
   * @returns {Promise<boolean>}
   */
  async validateSessionAfter2FA(userId, sessionId, loginInfo) {
    try {
      // Log session validation event
      await SecurityEvent.logEvent({
        userId,
        eventType: 'SESSION_VALIDATION_SUCCESS',
        severity: 'info',
        source: 'session_validation',
        ipAddress: loginInfo.ipAddress,
        details: {
          sessionId,
          method: '2FA_VERIFICATION'
        },
        riskScore: 0,
        action: 'allowed'
      });

      // Mark device as trusted if risk is low
      if (loginInfo.deviceFingerprint) {
        const device = await DeviceFingerprint.findOne({
          user: userId,
          fingerprint: loginInfo.deviceFingerprint
        });

        if (device && device.status !== 'trusted') {
          device.status = 'trusted';
          device.trustScore = Math.min(1, (device.trustScore || 0.5) + 0.1);
          await device.save();
        }
      }

      return true;
    } catch (error) {
      console.error('Error validating session after 2FA:', error);
      throw error;
    }
  }

  /**
   * Enforce backup code one-time use
   * @param {string} userId - User ID
   * @param {string} backupCode - Backup code used
   * @returns {Promise<boolean>}
   */
  async validateBackupCodeOneTimeUse(userId, backupCode) {
    try {
      // Check if this backup code was already used
      const recentUsage = await SecurityEvent.findOne({
        userId,
        eventType: 'BACKUP_CODE_SUCCESS',
        details: { $elemMatch: { backupCode } },
        createdAt: { $gte: new Date(Date.now() - 60 * 1000) } // Within last minute
      });

      if (recentUsage) {
        // Code was already used recently - this is suspicious
        await SecurityEvent.logEvent({
          userId,
          eventType: 'BACKUP_CODE_FAILURE',
          severity: 'high',
          source: 'backup_code_validation',
          details: {
            reason: 'BACKUP_CODE_REUSE_ATTEMPT',
            previousUsageTime: recentUsage.createdAt
          },
          riskScore: 40
        });

        throw new Error('Backup code already used');
      }

      return true;
    } catch (error) {
      console.error('Error validating backup code one-time use:', error);
      throw error;
    }
  }

  /**
   * Check for brute force attempts
   */
  async checkBruteForcePattern(userId, ipAddress) {
    try {
      const attempts = await SecurityEvent.countDocuments({
        userId,
        eventType: { $in: ['2FA_FAILURE', 'LOGIN_ATTEMPT', 'BACKUP_CODE_FAILURE'] },
        ipAddress,
        createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) } // Last 15 minutes
      });

      // Flag if more than 5 failed attempts from same IP in 15 minutes
      if (attempts > 5) {
        await SecurityEvent.logEvent({
          userId,
          eventType: 'BRUTE_FORCE_ATTEMPT',
          severity: 'critical',
          source: 'brute_force_detection',
          ipAddress,
          details: {
            attemptCount: attempts,
            timeWindow: '15 minutes'
          },
          riskScore: 90,
          action: 'blocked'
        });

        return { isBruteForce: true, attemptCount: attempts };
      }

      return { isBruteForce: false, attemptCount: attempts };
    } catch (error) {
      console.error('Error checking brute force pattern:', error);
      return { isBruteForce: false, attemptCount: 0 };
    }
  }

  /**
   * Mark device as blocked after suspicious activity
   */
  async blockDevice(userId, deviceFingerprint, reason) {
    try {
      const device = await DeviceFingerprint.findOne({
        user: userId,
        fingerprint: deviceFingerprint
      });

      if (device) {
        device.status = 'blocked';
        device.trustScore = 0;
        await device.save();

        await SecurityEvent.logEvent({
          userId,
          eventType: 'DEVICE_FINGERPRINT_MISMATCH',
          severity: 'critical',
          source: 'device_blocking',
          deviceFingerprint,
          details: {
            reason,
            action: 'blocked'
          },
          action: 'blocked'
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error blocking device:', error);
      throw error;
    }
  }

  /**
   * Unblock device
   */
  async unblockDevice(userId, deviceFingerprint) {
    try {
      const device = await DeviceFingerprint.findOne({
        user: userId,
        fingerprint: deviceFingerprint
      });

      if (device) {
        device.status = 'suspicious';
        device.trustScore = 0.3;
        await device.save();

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error unblocking device:', error);
      throw error;
    }
  }

  /**
   * Get risk profile for user
   */
  async getUserRiskProfile(userId, hours = 24) {
    try {
      const recentEvents = await SecurityEvent.getRecentEvents(userId, hours);
      
      const profile = {
        totalEvents: recentEvents.length,
        suspiciousEvents: recentEvents.filter(e => e.flagged).length,
        failedAttempts: recentEvents.filter(e => e.eventType.includes('FAILURE')).length,
        uniqueIPs: new Set(recentEvents.map(e => e.ipAddress)).size,
        uniqueLocations: new Set(recentEvents.map(e => e.location?.country)).size,
        maxRiskScore: Math.max(...recentEvents.map(e => e.riskScore || 0), 0),
        averageRiskScore: recentEvents.reduce((sum, e) => sum + (e.riskScore || 0), 0) / (recentEvents.length || 1),
        requiresAttention: recentEvents.some(e => e.requiresManualReview)
      };

      return profile;
    } catch (error) {
      console.error('Error getting user risk profile:', error);
      throw error;
    }
  }
}

module.exports = new SuspiciousLoginDetectionService();
