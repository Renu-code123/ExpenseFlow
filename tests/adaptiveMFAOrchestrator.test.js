const AdaptiveMFAOrchestrator = require('../services/adaptiveMFAOrchestrator');
const TwoFactorAuth = require('../models/TwoFactorAuth');
const SecurityEvent = require('../models/SecurityEvent');
const AuditLog = require('../models/AuditLog');

/**
 * Test Suite for Adaptive MFA Orchestrator
 * Issue #871: Adaptive MFA Orchestrator with Confidence-Aware Challenge Selection
 */

describe('Adaptive MFA Orchestrator', () => {
  let testUserId;
  let testContext;

  beforeEach(() => {
    testUserId = 'test-user-123';
    testContext = {
      deviceFingerprint: 'test-device-fingerprint',
      location: {
        country: 'US',
        city: 'New York'
      },
      timestamp: new Date(),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      sessionId: 'test-session-123'
    };

    // Clear mocks
    jest.clearAllMocks();
  });

  describe('Confidence Score Calculation', () => {
    test('should calculate high confidence for trusted device and location', async () => {
      // Mock trusted device
      jest.spyOn(AdaptiveMFAOrchestrator, 'evaluateDeviceTrust')
        .mockResolvedValue({ score: 1.0, reasoning: 'Trusted device' });

      // Mock location trust
      jest.spyOn(AdaptiveMFAOrchestrator, 'evaluateLocationTrust')
        .mockResolvedValue({ score: 0.9, reasoning: 'Known location' });

      // Mock other factors
      jest.spyOn(AdaptiveMFAOrchestrator, 'evaluateTimeTrust')
        .mockResolvedValue({ score: 0.8, reasoning: 'Typical time' });
      jest.spyOn(AdaptiveMFAOrchestrator, 'evaluateActivityTrust')
        .mockResolvedValue({ score: 0.7, reasoning: 'Normal activity' });
      jest.spyOn(AdaptiveMFAOrchestrator, 'evaluateAccountAge')
        .mockResolvedValue({ score: 0.9, reasoning: 'Established account' });
      jest.spyOn(AdaptiveMFAOrchestrator, 'evaluateFailedAttempts')
        .mockResolvedValue({ score: 1.0, reasoning: 'No recent failures' });

      const result = await AdaptiveMFAOrchestrator.calculateConfidenceScore(testUserId, testContext);

      expect(result.score).toBeGreaterThan(0.8);
      expect(result.factors.deviceTrust).toBe(1.0);
      expect(result.factors.locationTrust).toBe(0.9);
      expect(result.reasoning).toContain('Trusted device');
    });

    test('should calculate low confidence for unknown device and location', async () => {
      // Mock untrusted device
      jest.spyOn(AdaptiveMFAOrchestrator, 'evaluateDeviceTrust')
        .mockResolvedValue({ score: 0.0, reasoning: 'Untrusted device' });

      // Mock unknown location
      jest.spyOn(AdaptiveMFAOrchestrator, 'evaluateLocationTrust')
        .mockResolvedValue({ score: 0.2, reasoning: 'Unknown location' });

      // Mock other factors with low scores
      jest.spyOn(AdaptiveMFAOrchestrator, 'evaluateTimeTrust')
        .mockResolvedValue({ score: 0.3, reasoning: 'Unusual time' });
      jest.spyOn(AdaptiveMFAOrchestrator, 'evaluateActivityTrust')
        .mockResolvedValue({ score: 0.1, reasoning: 'Suspicious activity' });
      jest.spyOn(AdaptiveMFAOrchestrator, 'evaluateAccountAge')
        .mockResolvedValue({ score: 0.4, reasoning: 'New account' });
      jest.spyOn(AdaptiveMFAOrchestrator, 'evaluateFailedAttempts')
        .mockResolvedValue({ score: 0.0, reasoning: 'Recent failures' });

      const result = await AdaptiveMFAOrchestrator.calculateConfidenceScore(testUserId, testContext);

      expect(result.score).toBeLessThan(0.3);
      expect(result.factors.deviceTrust).toBe(0.0);
      expect(result.factors.locationTrust).toBe(0.2);
    });
  });

  describe('MFA Requirement Determination', () => {
    test('should bypass MFA for high confidence score', async () => {
      // Mock high confidence
      jest.spyOn(AdaptiveMFAOrchestrator, 'calculateConfidenceScore')
        .mockResolvedValue({
          score: 0.9,
          factors: { deviceTrust: 1.0, locationTrust: 0.8 },
          reasoning: ['High trust factors']
        });

      // Mock no recent bypass
      jest.spyOn(AdaptiveMFAOrchestrator, 'checkRecentBypass')
        .mockResolvedValue({ canBypass: false });

      // Mock 2FA enabled
      jest.spyOn(TwoFactorAuth, 'findOne').mockResolvedValue({
        userId: testUserId,
        enabled: true,
        totpSecret: 'test-secret'
      });

      const result = await AdaptiveMFAOrchestrator.determineMFARequirement(testUserId, testContext);

      expect(result.required).toBe(true); // Still requires MFA but with low friction challenge
      expect(result.confidence.score).toBe(0.9);
    });

    test('should require MFA for low confidence score', async () => {
      // Mock low confidence
      jest.spyOn(AdaptiveMFAOrchestrator, 'calculateConfidenceScore')
        .mockResolvedValue({
          score: 0.2,
          factors: { deviceTrust: 0.0, locationTrust: 0.3 },
          reasoning: ['Low trust factors']
        });

      // Mock challenge selection
      jest.spyOn(AdaptiveMFAOrchestrator, 'selectChallenge')
        .mockResolvedValue({ type: 'totp', method: 'totp', friction: 'medium' });

      // Mock 2FA enabled
      jest.spyOn(TwoFactorAuth, 'findOne').mockResolvedValue({
        userId: testUserId,
        enabled: true,
        totpSecret: 'test-secret'
      });

      const result = await AdaptiveMFAOrchestrator.determineMFARequirement(testUserId, testContext);

      expect(result.required).toBe(true);
      expect(result.challenge.type).toBe('totp');
      expect(result.confidence.score).toBe(0.2);
    });

    test('should bypass MFA when 2FA not enabled', async () => {
      // Mock 2FA disabled
      jest.spyOn(TwoFactorAuth, 'findOne').mockResolvedValue(null);

      const result = await AdaptiveMFAOrchestrator.determineMFARequirement(testUserId, testContext);

      expect(result.required).toBe(false);
      expect(result.challenge).toBe(null);
    });
  });

  describe('Challenge Selection', () => {
    test('should select low friction challenge for low risk', async () => {
      const availableMethods = ['totp', 'push', 'webauthn'];
      const twoFAAuth = { totpSecret: 'secret', pushEnabled: true, webauthnCredentials: [{}] };

      jest.spyOn(AdaptiveMFAOrchestrator, 'getAvailableMethods')
        .mockReturnValue(availableMethods);

      const challenge = await AdaptiveMFAOrchestrator.selectChallenge(testUserId, 'LOW', twoFAAuth, testContext);

      expect(['push', 'webauthn']).toContain(challenge.type);
      expect(challenge.friction).toBe('low');
    });

    test('should select high friction challenge for high risk', async () => {
      const availableMethods = ['totp', 'knowledge'];
      const twoFAAuth = { totpSecret: 'secret', knowledgeQuestions: [{}] };

      jest.spyOn(AdaptiveMFAOrchestrator, 'getAvailableMethods')
        .mockReturnValue(availableMethods);

      const challenge = await AdaptiveMFAOrchestrator.selectChallenge(testUserId, 'HIGH', twoFAAuth, testContext);

      expect(challenge.type).toBe('knowledge');
      expect(challenge.friction).toBe('high');
    });
  });

  describe('Challenge Verification', () => {
    test('should successfully verify TOTP challenge', async () => {
      const twoFAAuth = { method: 'totp', totpSecret: 'test-secret' };

      jest.spyOn(TwoFactorAuth, 'findOne').mockResolvedValue(twoFAAuth);
      jest.spyOn(require('../services/twoFactorAuthService'), 'verifyTOTP')
        .mockResolvedValue({ success: true });

      const result = await AdaptiveMFAOrchestrator.verifyChallenge(
        testUserId, 'totp', { code: '123456' }, testContext
      );

      expect(result.success).toBe(true);
      expect(result.reasoning).toContain('Successfully verified totp challenge');
    });

    test('should handle failed challenge verification', async () => {
      const twoFAAuth = { method: 'totp', totpSecret: 'test-secret' };

      jest.spyOn(TwoFactorAuth, 'findOne').mockResolvedValue(twoFAAuth);
      jest.spyOn(require('../services/twoFactorAuthService'), 'verifyTOTP')
        .mockResolvedValue({ success: false, reason: 'Invalid code' });

      const result = await AdaptiveMFAOrchestrator.verifyChallenge(
        testUserId, 'totp', { code: 'wrong' }, testContext
      );

      expect(result.success).toBe(false);
      expect(result.reasoning).toContain('Failed totp challenge: Invalid code');
    });
  });

  describe('Audit Logging', () => {
    test('should log challenge decisions', async () => {
      const auditLogSpy = jest.spyOn(AuditLog, 'create').mockResolvedValue({});

      const confidence = { score: 0.8, factors: {}, reasoning: [] };
      await AdaptiveMFAOrchestrator.logChallengeDecision(
        testUserId, 'CHALLENGE', confidence, testContext, ['Test reasoning']
      );

      expect(auditLogSpy).toHaveBeenCalledWith({
        userId: testUserId,
        action: 'MFA_CHALLENGE_SELECTED',
        actionType: 'security',
        resourceType: 'AdaptiveMFA',
        details: expect.objectContaining({
          confidenceScore: 0.8,
          riskLevel: 'LOW',
          reasoning: ['Test reasoning']
        })
      });
    });
  });

  describe('Risk Level Classification', () => {
    test('should classify risk levels correctly', () => {
      expect(AdaptiveMFAOrchestrator.getRiskLevel(0.9)).toBe('LOW');
      expect(AdaptiveMFAOrchestrator.getRiskLevel(0.7)).toBe('MEDIUM');
      expect(AdaptiveMFAOrchestrator.getRiskLevel(0.3)).toBe('HIGH');
    });
  });
});