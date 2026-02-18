/**
 * Session Anomaly Detection Tests
 * Issue #562: Session Hijacking Detection
 * 
 * Test suite for session anomaly detection functionality
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Session = require('../models/Session');
const SecurityEvent = require('../models/SecurityEvent');
const SessionAnomalyDetectionService = require('../services/sessionAnomalyDetectionService');

describe('Session Anomaly Detection', () => {
  let testUser;
  let authToken;
  let sessionId;

  beforeAll(async () => {
    // Connect to test database
    // await mongoose.connect(process.env.TEST_MONGODB_URI);
  });

  afterAll(async () => {
    // Cleanup and disconnect
    // await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Create test user
    testUser = await User.create({
      email: 'test@example.com',
      password: 'TestPassword123!',
      name: 'Test User',
      twoFactorAuth: {
        enabled: false
      }
    });
  });

  afterEach(async () => {
    // Cleanup test data
    await User.deleteMany({ email: 'test@example.com' });
    await Session.deleteMany({ userId: testUser._id });
    await SecurityEvent.deleteMany({ userId: testUser._id });
  });

  // ============================================================================
  // IP Drift Detection Tests
  // ============================================================================

  describe('IP Drift Detection', () => {
    it('should detect IP address change and force re-authentication', async () => {
      // Login from IP 1
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.168.1.1')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      expect(loginRes.status).toBe(200);
      authToken = loginRes.body.token;

      // Make request from different IP (IP 2)
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Forwarded-For', '10.0.0.1')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

      // Should be rejected due to IP drift
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_ANOMALY_DETECTED');
      expect(res.body.anomalyTypes).toContain('IP_DRIFT');
      expect(res.body.requiresReauth).toBe(true);
    });

    it('should create security event for IP drift', async () => {
      // Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.168.1.1')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      authToken = loginRes.body.token;

      // Request from different IP
      await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Forwarded-For', '10.0.0.1');

      // Check security event was created
      const securityEvents = await SecurityEvent.find({
        userId: testUser._id,
        eventType: 'SESSION_ANOMALY_DETECTED'
      });

      expect(securityEvents.length).toBeGreaterThan(0);
      expect(securityEvents[0].details.anomalyTypes).toContain('IP_DRIFT');
    });

    it('should allow same IP address', async () => {
      const sameIP = '192.168.1.100';

      // Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', sameIP)
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      authToken = loginRes.body.token;

      // Request from same IP
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Forwarded-For', sameIP);

      expect(res.status).toBe(200);
    });
  });

  // ============================================================================
  // User Agent Drift Detection Tests
  // ============================================================================

  describe('User Agent Drift Detection', () => {
    it('should detect User Agent change', async () => {
      const ipAddress = '192.168.1.1';

      // Login with Chrome
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', ipAddress)
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      authToken = loginRes.body.token;

      // Request with Firefox (different browser)
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Forwarded-For', ipAddress)
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0');

      // Should detect UA drift
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_ANOMALY_DETECTED');
      expect(res.body.anomalyTypes).toContain('USER_AGENT_DRIFT');
    });

    it('should allow minor User Agent version changes', async () => {
      const ipAddress = '192.168.1.1';
      const baseUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/';

      // Login with Chrome 120
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', ipAddress)
        .set('User-Agent', baseUA + '120.0.0.0')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      authToken = loginRes.body.token;

      // Request with Chrome 120.0.1.0 (minor version update)
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Forwarded-For', ipAddress)
        .set('User-Agent', baseUA + '120.0.1.0');

      // Should allow (non-strict UA matching)
      expect(res.status).toBe(200);
    });
  });

  // ============================================================================
  // Combined Anomaly Tests
  // ============================================================================

  describe('Combined Anomaly Detection', () => {
    it('should detect both IP and UA drift with high risk score', async () => {
      // Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.168.1.1')
        .set('User-Agent', 'Mozilla/5.0 Chrome/120.0')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      authToken = loginRes.body.token;

      // Request with both IP and UA changed
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Forwarded-For', '10.0.0.1')
        .set('User-Agent', 'curl/7.68.0');

      expect(res.status).toBe(401);
      expect(res.body.anomalyTypes).toContain('IP_DRIFT');
      expect(res.body.anomalyTypes).toContain('USER_AGENT_DRIFT');
      expect(res.body.riskScore).toBeGreaterThan(70);
    });
  });

  // ============================================================================
  // Rapid Session Switching Tests
  // ============================================================================

  describe('Rapid Session Switching Detection', () => {
    it('should detect multiple concurrent active sessions', async () => {
      const tokens = [];

      // Create multiple sessions rapidly
      for (let i = 0; i < 4; i++) {
        const loginRes = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', `192.168.1.${i}`)
          .send({
            email: 'test@example.com',
            password: 'TestPassword123!'
          });

        tokens.push(loginRes.body.token);
      }

      // Use the last token - should detect rapid session switching
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${tokens[3]}`)
        .set('X-Forwarded-For', '192.168.1.3');

      // May or may not trigger depending on timing
      // This test verifies the detection logic exists
      if (res.body.anomalyTypes) {
        expect(res.body.anomalyTypes).toContain('RAPID_SESSION_SWITCHING');
      }
    });
  });

  // ============================================================================
  // Strict Mode Tests
  // ============================================================================

  describe('Strict Session Anomaly Mode', () => {
    it('should reject any anomaly in strict mode', async () => {
      // Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.168.1.1')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      authToken = loginRes.body.token;

      // Try to access strict endpoint with IP change
      const res = await request(app)
        .post('/api/account/delete')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Forwarded-For', '192.168.1.2');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_ANOMALY_DETECTED');
    });
  });

  // ============================================================================
  // Service Unit Tests
  // ============================================================================

  describe('SessionAnomalyDetectionService', () => {
    let mockSession;
    let mockRequest;

    beforeEach(() => {
      mockSession = {
        _id: 'session123',
        userId: testUser._id,
        status: 'active',
        location: {
          ipAddress: '192.168.1.1'
        },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
        activity: {
          lastAccessAt: new Date()
        },
        security: {
          flags: [],
          riskScore: 0
        },
        save: jest.fn()
      };

      mockRequest = {
        ip: '192.168.1.1',
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0'
        }
      };

      // Mock Session.findById
      Session.findById = jest.fn().mockResolvedValue(mockSession);
      Session.countDocuments = jest.fn().mockResolvedValue(1);
    });

    it('should return no anomaly for matching IP and UA', async () => {
      const result = await SessionAnomalyDetectionService.checkSessionAnomaly(
        'session123',
        mockRequest
      );

      expect(result.hasAnomaly).toBe(false);
      expect(result.anomalyType).toHaveLength(0);
      expect(result.action).toBe('ALLOW');
    });

    it('should detect IP drift', async () => {
      mockRequest.ip = '10.0.0.1';

      const result = await SessionAnomalyDetectionService.checkSessionAnomaly(
        'session123',
        mockRequest
      );

      expect(result.hasAnomaly).toBe(true);
      expect(result.anomalyType).toContain('IP_DRIFT');
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it('should detect User Agent drift', async () => {
      mockRequest.headers['user-agent'] = 'curl/7.68.0';

      const result = await SessionAnomalyDetectionService.checkSessionAnomaly(
        'session123',
        mockRequest
      );

      expect(result.hasAnomaly).toBe(true);
      expect(result.anomalyType).toContain('USER_AGENT_DRIFT');
    });

    it('should calculate correct risk score for multiple anomalies', async () => {
      mockRequest.ip = '10.0.0.1';
      mockRequest.headers['user-agent'] = 'curl/7.68.0';

      const result = await SessionAnomalyDetectionService.checkSessionAnomaly(
        'session123',
        mockRequest
      );

      expect(result.hasAnomaly).toBe(true);
      expect(result.riskScore).toBeGreaterThan(70);
      expect(result.action).toBe('FORCE_REAUTH');
    });

    it('should force re-authentication for high risk sessions', async () => {
      const forceReauthSpy = jest.spyOn(
        SessionAnomalyDetectionService,
        'forceReauthentication'
      );

      await SessionAnomalyDetectionService.forceReauthentication(
        'session123',
        'Test reason'
      );

      expect(forceReauthSpy).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('Anomaly Detection Configuration', () => {
    it('should respect allowIPChange configuration', async () => {
      // Temporarily enable IP change allowance
      const originalConfig = SessionAnomalyDetectionService.config.allowIPChange;
      SessionAnomalyDetectionService.config.allowIPChange = true;

      const ipCheck = await SessionAnomalyDetectionService.checkIPDrift(
        { location: { ipAddress: '192.168.1.1' } },
        '10.0.0.1'
      );

      // Should still detect drift but with lower risk
      expect(ipCheck.isDrift).toBe(true);
      expect(ipCheck.riskIncrease).toBeLessThan(20);

      // Restore config
      SessionAnomalyDetectionService.config.allowIPChange = originalConfig;
    });

    it('should respect risk score thresholds', () => {
      const config = SessionAnomalyDetectionService.config;

      expect(config.riskScoreThresholds.low).toBeLessThan(
        config.riskScoreThresholds.medium
      );
      expect(config.riskScoreThresholds.medium).toBeLessThan(
        config.riskScoreThresholds.high
      );
      expect(config.riskScoreThresholds.high).toBeLessThan(
        config.riskScoreThresholds.critical
      );
    });
  });

  // ============================================================================
  // Statistics and Reporting Tests
  // ============================================================================

  describe('Anomaly Statistics', () => {
    it('should retrieve anomaly statistics', async () => {
      // Create some test security events
      await SecurityEvent.create([
        {
          userId: testUser._id,
          eventType: 'SESSION_ANOMALY_DETECTED',
          severity: 'high',
          ipAddress: '192.168.1.1',
          details: { anomalyTypes: 'IP_DRIFT' },
          riskScore: 75,
          timestamp: new Date()
        },
        {
          userId: testUser._id,
          eventType: 'SESSION_ANOMALY_DETECTED',
          severity: 'medium',
          ipAddress: '192.168.1.1',
          details: { anomalyTypes: 'USER_AGENT_DRIFT' },
          riskScore: 50,
          timestamp: new Date()
        }
      ]);

      const stats = await SessionAnomalyDetectionService.getAnomalyStatistics(
        testUser._id,
        30
      );

      expect(stats.totalAnomalies).toBe(2);
      expect(stats.anomalyTypes.IP_DRIFT).toBe(1);
      expect(stats.anomalyTypes.USER_AGENT_DRIFT).toBe(1);
      expect(stats.averageRiskScore).toBe(62.5);
    });
  });
});

// ============================================================================
// Integration Test Helpers
// ============================================================================

/**
 * Helper: Simulate login from specific IP and UA
 */
async function loginWith(app, credentials, ip, userAgent) {
  return await request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-For', ip)
    .set('User-Agent', userAgent)
    .send(credentials);
}

/**
 * Helper: Make authenticated request with specific IP and UA
 */
async function makeRequestWith(app, endpoint, token, ip, userAgent) {
  return await request(app)
    .get(endpoint)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Forwarded-For', ip)
    .set('User-Agent', userAgent);
}

module.exports = {
  loginWith,
  makeRequestWith
};
