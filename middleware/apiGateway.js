const jwt = require('jsonwebtoken');
const apiGatewayPolicyService = require('../services/apiGatewayPolicyService');
const securityMonitor = require('../services/securityMonitor');

class ApiGateway {
  constructor() {
    this.rateLimitStore = new Map();
    this.riskProfileStore = new Map();
    this.riskDecisionTrail = [];
    this.maxRiskDecisionTrail = 5000;
    this.latencySamples = [];
    this.maxLatencySamples = 250;
    this.trackedMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

    apiGatewayPolicyService.on('reloaded', (event) => {
      console.log('API Gateway policies reloaded:', event);
    });

    apiGatewayPolicyService.on('reload_error', (event) => {
      console.error('API Gateway policy reload error:', event);
    });

    apiGatewayPolicyService.on('updated', (event) => {
      console.log('API Gateway policies updated:', event);
    });
  }

  getClientIp(req) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return forwardedFor.split(',')[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || 'unknown';
  }

  clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
  }

  toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  getCorrelationId(req) {
    return req.headers['x-correlation-id']
      || req.headers['x-request-id']
      || req.auditContext?.requestId
      || req.forensicTraceId
      || `gw_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  getSensitivityRisk(sensitivityTag = 'medium') {
    const normalized = String(sensitivityTag || 'medium').toLowerCase();
    switch (normalized) {
      case 'low':
        return 15;
      case 'medium':
        return 40;
      case 'high':
        return 70;
      case 'critical':
        return 90;
      default:
        return 40;
    }
  }

  getRiskConfig(policy = {}) {
    const policyConfig = policy.adaptiveRisk || {};
    const defaultConfig = {
      enabled: true,
      overheadBudgetMs: 50,
      sensitivityTag: policy.sensitivityTag || policy.threatDetection?.sensitivity || 'medium',
      thresholds: {
        tier1: 25,
        tier2: 50,
        tier3: 72,
        tier4: 90
      },
      dynamicRateLimit: {
        enabled: true,
        multipliers: {
          tier0: 1,
          tier1: 1,
          tier2: 0.7,
          tier3: 0.35,
          tier4: 0.05
        }
      },
      stepUpAuth: {
        enabled: true,
        tiers: [2, 3, 4]
      },
      geoVelocity: {
        enabled: true,
        suspiciousKmh: 500,
        impossibleKmh: 900
      },
      behavior: {
        windowMs: 60000,
        burstRequestThreshold: 90,
        anomalyMemoryWeight: 0.35
      },
      weights: {
        devicePosture: 0.2,
        ipReputation: 0.2,
        sessionConfidence: 0.2,
        requestSensitivity: 0.2,
        historicalBehavior: 0.2
      },
      enforcement: {
        tier0: { mode: 'transparent' },
        tier1: { mode: 'soft-monitoring', monitorOnly: true },
        tier2: { mode: 'step-up-auth', requireStepUpAuth: true },
        tier3: { mode: 'throttled-restricted', throttle: true, restrictWriteMethods: true },
        tier4: { mode: 'blocked-soc-alert', block: true, socAlert: true }
      }
    };

    return {
      ...defaultConfig,
      ...policyConfig,
      thresholds: {
        ...defaultConfig.thresholds,
        ...(policyConfig.thresholds || {})
      },
      dynamicRateLimit: {
        ...defaultConfig.dynamicRateLimit,
        ...(policyConfig.dynamicRateLimit || {}),
        multipliers: {
          ...defaultConfig.dynamicRateLimit.multipliers,
          ...((policyConfig.dynamicRateLimit || {}).multipliers || {})
        }
      },
      stepUpAuth: {
        ...defaultConfig.stepUpAuth,
        ...(policyConfig.stepUpAuth || {})
      },
      geoVelocity: {
        ...defaultConfig.geoVelocity,
        ...(policyConfig.geoVelocity || {})
      },
      behavior: {
        ...defaultConfig.behavior,
        ...(policyConfig.behavior || {})
      },
      weights: {
        ...defaultConfig.weights,
        ...(policyConfig.weights || {})
      },
      enforcement: {
        ...defaultConfig.enforcement,
        ...(policyConfig.enforcement || {})
      }
    };
  }

  getRiskActorKey(req) {
    const clientIp = this.getClientIp(req);
    const sessionId = req.headers['x-session-id'] || req.headers['x-session-token'];
    const fingerprint = req.headers['x-device-fingerprint'];
    const userAgent = req.headers['user-agent'] || 'unknown-agent';
    const explicitUser = req.user?._id || req.user?.id || req.gatewayAuth?.claims?.id || req.gatewayAuth?.claims?.sub;

    if (explicitUser) {
      return `user:${explicitUser}`;
    }

    if (sessionId) {
      return `session:${sessionId}`;
    }

    return `anon:${clientIp}:${fingerprint || userAgent.slice(0, 40)}`;
  }

  getRiskProfile(actorKey) {
    const existing = this.riskProfileStore.get(actorKey);
    if (existing) {
      return existing;
    }

    const profile = {
      actorKey,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      lastTier: 0,
      lastRiskScore: 0,
      recentRequests: [],
      anomalyCount: 0,
      lastGeoPoint: null
    };

    this.riskProfileStore.set(actorKey, profile);
    return profile;
  }

  parseGeoPoint(req) {
    const lat = this.toNumber(req.headers['x-geo-lat'], NaN);
    const lon = this.toNumber(req.headers['x-geo-lon'], NaN);
    const tsRaw = req.headers['x-geo-timestamp'];

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    const timestamp = tsRaw ? this.toNumber(tsRaw, Date.now()) : Date.now();
    return {
      lat,
      lon,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now()
    };
  }

  calculateDistanceKm(pointA, pointB) {
    const toRad = (value) => (value * Math.PI) / 180;
    const radiusKm = 6371;
    const dLat = toRad(pointB.lat - pointA.lat);
    const dLon = toRad(pointB.lon - pointA.lon);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(pointA.lat)) * Math.cos(toRad(pointB.lat)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return radiusKm * c;
  }

  evaluateGeoVelocityRisk(req, profile, riskConfig) {
    const geoConfig = riskConfig.geoVelocity || {};
    if (!geoConfig.enabled) {
      return {
        geoRiskScore: 0,
        speedKmh: 0,
        isGeoVelocityAnomaly: false,
        isImpossibleTravel: false
      };
    }

    const currentPoint = this.parseGeoPoint(req);
    if (!currentPoint) {
      return {
        geoRiskScore: 0,
        speedKmh: 0,
        isGeoVelocityAnomaly: false,
        isImpossibleTravel: false
      };
    }

    const previousPoint = profile.lastGeoPoint;
    profile.lastGeoPoint = currentPoint;

    if (!previousPoint || currentPoint.timestamp <= previousPoint.timestamp) {
      return {
        geoRiskScore: 0,
        speedKmh: 0,
        isGeoVelocityAnomaly: false,
        isImpossibleTravel: false
      };
    }

    const distanceKm = this.calculateDistanceKm(previousPoint, currentPoint);
    const hours = (currentPoint.timestamp - previousPoint.timestamp) / (1000 * 60 * 60);
    const speedKmh = hours > 0 ? distanceKm / hours : 0;

    const impossibleThreshold = this.toNumber(geoConfig.impossibleKmh, 900);
    const suspiciousThreshold = this.toNumber(geoConfig.suspiciousKmh, 500);

    const isImpossibleTravel = speedKmh >= impossibleThreshold;
    const isGeoVelocityAnomaly = speedKmh >= suspiciousThreshold;

    let geoRiskScore = 0;
    if (isImpossibleTravel) {
      geoRiskScore = 100;
    } else if (isGeoVelocityAnomaly) {
      geoRiskScore = this.clamp(60 + ((speedKmh - suspiciousThreshold) / Math.max(1, impossibleThreshold - suspiciousThreshold)) * 35, 60, 95);
    }

    return {
      geoRiskScore: this.toNumber(geoRiskScore, 0),
      speedKmh: this.toNumber(speedKmh, 0),
      isGeoVelocityAnomaly,
      isImpossibleTravel
    };
  }

  evaluateBehaviorRisk(profile, riskConfig) {
    const behavior = riskConfig.behavior || {};
    const now = Date.now();
    const windowMs = this.toNumber(behavior.windowMs, 60000);
    const threshold = this.toNumber(behavior.burstRequestThreshold, 90);
    const memoryWeight = this.toNumber(behavior.anomalyMemoryWeight, 0.35);

    profile.recentRequests = profile.recentRequests.filter((timestamp) => now - timestamp <= windowMs);
    profile.recentRequests.push(now);

    const burstRatio = profile.recentRequests.length / Math.max(1, threshold);
    const burstRisk = this.clamp((burstRatio - 0.6) * 100, 0, 100);
    const memoryRisk = this.clamp(profile.anomalyCount * (memoryWeight * 20), 0, 50);
    const priorTierRisk = profile.lastTier >= 2 ? profile.lastTier * 8 : 0;

    return this.clamp((burstRisk * 0.6) + (memoryRisk * 0.3) + (priorTierRisk * 0.1), 0, 100);
  }

  evaluateRisk(req, policy) {
    const startedAt = Date.now();
    const riskConfig = this.getRiskConfig(policy);
    const actorKey = this.getRiskActorKey(req);
    const profile = this.getRiskProfile(actorKey);

    if (!riskConfig.enabled) {
      const latencyMs = Date.now() - startedAt;
      this.latencySamples.push(latencyMs);
      if (this.latencySamples.length > this.maxLatencySamples) {
        this.latencySamples.shift();
      }

      return {
        riskEnabled: false,
        actorKey,
        previousTier: profile.lastTier,
        tier: 0,
        riskScore: 0,
        sensitivityTag: riskConfig.sensitivityTag || 'medium',
        thresholds: riskConfig.thresholds || {},
        enforcement: riskConfig.enforcement?.tier0 || { mode: 'transparent' },
        components: {
          devicePosture: 0,
          ipReputation: 0,
          sessionRisk: 0,
          requestSensitivity: 0,
          historicalBehavior: 0,
          geoVelocity: 0
        },
        geoVelocity: {
          speedKmh: 0,
          anomaly: false,
          impossibleTravel: false
        },
        latencyMs,
        overheadBudgetMs: this.toNumber(riskConfig.overheadBudgetMs, 50),
        correlationId: this.getCorrelationId(req)
      };
    }

    const deviceTrustScore = this.clamp(this.toNumber(req.headers['x-device-trust-score'], 0.5), 0, 1);
    const devicePostureRaw = String(req.headers['x-device-posture'] || 'unknown').toLowerCase();
    const deviceRiskByPosture = devicePostureRaw === 'trusted'
      ? 5
      : devicePostureRaw === 'managed'
        ? 12
        : devicePostureRaw === 'compromised'
          ? 95
          : 35;
    const deviceRiskScore = this.clamp(Math.max(deviceRiskByPosture, (1 - deviceTrustScore) * 100), 0, 100);

    const ipReputation = this.clamp(this.toNumber(req.headers['x-ip-reputation-score'], 35), 0, 100);
    const sessionConfidence = this.clamp(this.toNumber(req.headers['x-session-confidence'], 65), 0, 100);
    const sessionRiskScore = this.clamp(100 - sessionConfidence, 0, 100);
    const sensitivityRiskScore = this.getSensitivityRisk(riskConfig.sensitivityTag || policy.sensitivityTag);
    const behaviorRiskScore = this.evaluateBehaviorRisk(profile, riskConfig);
    const geoResult = this.evaluateGeoVelocityRisk(req, profile, riskConfig);

    const weights = riskConfig.weights || {};
    const weightedRiskScore = this.clamp(
      (deviceRiskScore * this.toNumber(weights.devicePosture, 0.2))
        + (ipReputation * this.toNumber(weights.ipReputation, 0.2))
        + (sessionRiskScore * this.toNumber(weights.sessionConfidence, 0.2))
        + (sensitivityRiskScore * this.toNumber(weights.requestSensitivity, 0.2))
        + (behaviorRiskScore * this.toNumber(weights.historicalBehavior, 0.2)),
      0,
      100
    );

    const finalRiskScore = this.clamp((weightedRiskScore * 0.88) + (geoResult.geoRiskScore * 0.12), 0, 100);
    const thresholds = riskConfig.thresholds || {};

    let tier = 0;
    if (finalRiskScore >= this.toNumber(thresholds.tier4, 90)) {
      tier = 4;
    } else if (finalRiskScore >= this.toNumber(thresholds.tier3, 72)) {
      tier = 3;
    } else if (finalRiskScore >= this.toNumber(thresholds.tier2, 50)) {
      tier = 2;
    } else if (finalRiskScore >= this.toNumber(thresholds.tier1, 25)) {
      tier = 1;
    }

    const enforcement = riskConfig.enforcement?.[`tier${tier}`] || { mode: 'transparent' };
    const previousTier = profile.lastTier;
    profile.lastSeenAt = Date.now();
    profile.lastRiskScore = finalRiskScore;
    profile.lastTier = tier;

    if (geoResult.isGeoVelocityAnomaly || tier >= 2) {
      profile.anomalyCount += 1;
    } else {
      profile.anomalyCount = Math.max(0, profile.anomalyCount - 1);
    }

    const latencyMs = Date.now() - startedAt;
    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > this.maxLatencySamples) {
      this.latencySamples.shift();
    }

    const result = {
      riskEnabled: Boolean(riskConfig.enabled),
      actorKey,
      previousTier,
      tier,
      riskScore: Number(finalRiskScore.toFixed(2)),
      sensitivityTag: riskConfig.sensitivityTag || 'medium',
      thresholds,
      enforcement,
      components: {
        devicePosture: Number(deviceRiskScore.toFixed(2)),
        ipReputation: Number(ipReputation.toFixed(2)),
        sessionRisk: Number(sessionRiskScore.toFixed(2)),
        requestSensitivity: Number(sensitivityRiskScore.toFixed(2)),
        historicalBehavior: Number(behaviorRiskScore.toFixed(2)),
        geoVelocity: Number(geoResult.geoRiskScore.toFixed(2))
      },
      geoVelocity: {
        speedKmh: Number(geoResult.speedKmh.toFixed(2)),
        anomaly: geoResult.isGeoVelocityAnomaly,
        impossibleTravel: geoResult.isImpossibleTravel
      },
      latencyMs,
      overheadBudgetMs: this.toNumber(riskConfig.overheadBudgetMs, 50),
      correlationId: this.getCorrelationId(req)
    };

    if (result.latencyMs > result.overheadBudgetMs) {
      console.warn('API_GATEWAY_RISK_LATENCY_BUDGET_EXCEEDED', JSON.stringify({
        endpoint: req.originalUrl,
        method: req.method,
        latencyMs: result.latencyMs,
        budgetMs: result.overheadBudgetMs,
        correlationId: result.correlationId
      }));
    }

    if (previousTier !== tier) {
      const transition = {
        timestamp: new Date().toISOString(),
        actorKey,
        endpoint: req.originalUrl,
        method: req.method,
        fromTier: previousTier,
        toTier: tier,
        riskScore: result.riskScore,
        policyId: policy.policyId || 'default',
        correlationId: result.correlationId
      };
      console.log('API_GATEWAY_ENFORCEMENT_TRANSITION', JSON.stringify(transition));
      securityMonitor.logSecurityEvent(req, 'gateway_enforcement_transition', transition);
    }

    return result;
  }

  getAuthToken(req) {
    const authHeader = req.header('Authorization') || req.header('authorization');
    if (!authHeader || typeof authHeader !== 'string') {
      return null;
    }

    if (!authHeader.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.replace('Bearer ', '').trim();
  }

  verifyJwtToken(token) {
    if (!process.env.JWT_SECRET) {
      return null;
    }

    try {
      return {
        type: 'jwt',
        claims: jwt.verify(token, process.env.JWT_SECRET)
      };
    } catch (error) {
      return null;
    }
  }

  verifyOAuthToken(token) {
    const publicKey = process.env.OAUTH2_JWT_PUBLIC_KEY;
    const sharedSecret = process.env.OAUTH2_JWT_SECRET;

    if (!publicKey && !sharedSecret) {
      return null;
    }

    const verifier = publicKey || sharedSecret;

    try {
      return {
        type: 'oauth2',
        claims: jwt.verify(token, verifier, {
          algorithms: publicKey ? ['RS256', 'RS384', 'RS512'] : ['HS256', 'HS384', 'HS512'],
          audience: process.env.OAUTH2_AUDIENCE || undefined,
          issuer: process.env.OAUTH2_ISSUER || undefined
        })
      };
    } catch (error) {
      return null;
    }
  }

  extractScopes(claims = {}) {
    if (Array.isArray(claims.scopes)) {
      return claims.scopes;
    }

    if (Array.isArray(claims.scope)) {
      return claims.scope;
    }

    if (typeof claims.scope === 'string') {
      return claims.scope
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean);
    }

    return [];
  }

  isMfaVerified(claims = {}, req) {
    const headerVerification = String(req.headers['x-mfa-verified'] || '').toLowerCase() === 'true';
    if (headerVerification) {
      return true;
    }

    if (claims.mfa === true || claims.mfa_verified === true || claims.amr === 'mfa') {
      return true;
    }

    if (Array.isArray(claims.amr) && claims.amr.map((value) => String(value).toLowerCase()).includes('mfa')) {
      return true;
    }

    return false;
  }

  enforceAuthentication(req, res, policy) {
    if (!policy.authRequired) {
      return true;
    }

    const token = this.getAuthToken(req);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required by API gateway policy',
        code: 'GATEWAY_AUTH_REQUIRED'
      });
      return false;
    }

    const allowedAuth = Array.isArray(policy.allowedAuth) && policy.allowedAuth.length > 0
      ? policy.allowedAuth
      : ['jwt', 'oauth2'];

    let verified = null;

    if (allowedAuth.includes('jwt')) {
      verified = this.verifyJwtToken(token);
    }

    if (!verified && allowedAuth.includes('oauth2')) {
      verified = this.verifyOAuthToken(token);
    }

    if (!verified) {
      res.status(401).json({
        success: false,
        error: 'Token validation failed for allowed auth strategies',
        code: 'GATEWAY_AUTH_INVALID'
      });
      return false;
    }

    const requiredScopes = Array.isArray(policy.requiredScopes) ? policy.requiredScopes : [];
    const tokenScopes = this.extractScopes(verified.claims);
    const missingScopes = requiredScopes.filter((scope) => !tokenScopes.includes(scope));

    if (missingScopes.length > 0) {
      res.status(403).json({
        success: false,
        error: 'Insufficient token scope for this endpoint',
        code: 'GATEWAY_SCOPE_DENIED',
        missingScopes
      });
      return false;
    }

    req.gatewayAuth = {
      type: verified.type,
      claims: verified.claims,
      scopes: tokenScopes
    };

    return true;
  }

  enforceStepUpAuthentication(req, res, policy, riskResult) {
    if (!riskResult.riskEnabled) {
      return true;
    }

    const riskConfig = this.getRiskConfig(policy);
    const stepUp = riskConfig.stepUpAuth || {};
    const tiers = Array.isArray(stepUp.tiers) ? stepUp.tiers.map((value) => this.toNumber(value, -1)) : [2, 3, 4];
    const stepUpRequired = Boolean(stepUp.enabled) && tiers.includes(riskResult.tier) && riskResult.tier >= 2;

    if (!stepUpRequired) {
      return true;
    }

    const claims = req.gatewayAuth?.claims || {};
    const verified = this.isMfaVerified(claims, req);
    if (verified) {
      return true;
    }

    res.status(401).json({
      success: false,
      error: 'Step-up authentication required by adaptive risk policy',
      code: 'GATEWAY_STEP_UP_REQUIRED',
      enforcementTier: riskResult.tier,
      riskScore: riskResult.riskScore,
      correlationId: riskResult.correlationId
    });
    return false;
  }

  getEffectiveRateLimit(policy, riskResult) {
    const rateLimit = policy.rateLimit || {};
    const windowMs = Number(rateLimit.windowMs) || 60000;
    const baseMax = Number(rateLimit.max) || 120;
    const riskConfig = this.getRiskConfig(policy);

    if (!riskResult.riskEnabled) {
      return {
        windowMs,
        max: baseMax,
        baseMax,
        multiplier: 1
      };
    }

    if (!riskConfig.dynamicRateLimit?.enabled) {
      return {
        windowMs,
        max: baseMax,
        baseMax,
        multiplier: 1
      };
    }

    const multiplier = this.toNumber(riskConfig.dynamicRateLimit.multipliers?.[`tier${riskResult.tier}`], 1);
    const adjustedMax = Math.max(1, Math.floor(baseMax * Math.max(0, multiplier)));
    return {
      windowMs,
      max: adjustedMax,
      baseMax,
      multiplier: Number(multiplier.toFixed(2))
    };
  }

  applyRateLimit(req, res, policy, riskResult) {
    const effectiveRateLimit = this.getEffectiveRateLimit(policy, riskResult);
    const windowMs = effectiveRateLimit.windowMs;
    const max = effectiveRateLimit.max;

    const routeKey = policy.policyId || policy.pattern || req.path;
    const clientIp = this.getClientIp(req);
    const key = `${routeKey}:${clientIp}`;
    const now = Date.now();

    const previous = this.rateLimitStore.get(key);
    if (!previous || now > previous.resetAt) {
      this.rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (previous.count >= max) {
      const retryAfterSeconds = Math.ceil((previous.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded by API gateway policy',
        code: 'GATEWAY_RATE_LIMITED',
        retryAfterSeconds,
        enforcementTier: riskResult.tier,
        riskScore: riskResult.riskScore,
        correlationId: riskResult.correlationId
      });
      return false;
    }

    previous.count += 1;
    this.rateLimitStore.set(key, previous);
    return true;
  }

  enforceTierRestrictions(req, res, policy, riskResult) {
    if (!riskResult.riskEnabled) {
      return true;
    }

    if (riskResult.enforcement?.block || riskResult.tier >= 4) {
      securityMonitor.logSecurityEvent(req, 'gateway_risk_blocked', {
        endpoint: req.originalUrl,
        method: req.method,
        policyId: policy.policyId || 'default',
        riskScore: riskResult.riskScore,
        tier: riskResult.tier,
        correlationId: riskResult.correlationId,
        socAlert: Boolean(riskResult.enforcement?.socAlert)
      });

      res.status(403).json({
        success: false,
        error: 'Request blocked by adaptive gateway risk policy',
        code: 'GATEWAY_RISK_BLOCKED',
        enforcementTier: riskResult.tier,
        riskScore: riskResult.riskScore,
        correlationId: riskResult.correlationId
      });
      return false;
    }

    const shouldRestrictWrites = Boolean(riskResult.enforcement?.restrictWriteMethods) || riskResult.tier >= 3;
    if (shouldRestrictWrites && this.trackedMethods.has(req.method.toUpperCase())) {
      res.status(403).json({
        success: false,
        error: 'Write operation restricted by adaptive gateway risk policy',
        code: 'GATEWAY_RISK_RESTRICTED',
        enforcementTier: riskResult.tier,
        riskScore: riskResult.riskScore,
        correlationId: riskResult.correlationId
      });
      return false;
    }

    return true;
  }

  validateRequest(req, res, policy) {
    const requestValidation = policy.requestValidation || {};
    const allowedContentTypes = Array.isArray(requestValidation.allowedContentTypes)
      ? requestValidation.allowedContentTypes
      : [];

    if (this.trackedMethods.has(req.method.toUpperCase()) && allowedContentTypes.length > 0) {
      const contentType = (req.headers['content-type'] || '').toLowerCase();
      const isAllowed = allowedContentTypes.some((allowedType) => contentType.includes(String(allowedType).toLowerCase()));

      if (!isAllowed) {
        res.status(415).json({
          success: false,
          error: 'Unsupported content type by API gateway policy',
          code: 'GATEWAY_CONTENT_TYPE_REJECTED'
        });
        return false;
      }
    }

    const requiredBodyFields = Array.isArray(requestValidation.requiredBodyFields)
      ? requestValidation.requiredBodyFields
      : [];

    if (requiredBodyFields.length > 0) {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const missingFields = requiredBodyFields.filter((field) => {
        const value = body[field];
        return value === undefined || value === null || value === '';
      });

      if (missingFields.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields by API gateway policy',
          code: 'GATEWAY_VALIDATION_FAILED',
          missingFields
        });
        return false;
      }
    }

    return true;
  }

  flattenValues(input, output = []) {
    if (input === null || input === undefined) {
      return output;
    }

    if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
      output.push(String(input));
      return output;
    }

    if (Array.isArray(input)) {
      for (const item of input) {
        this.flattenValues(item, output);
      }
      return output;
    }

    if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        output.push(String(key));
        this.flattenValues(value, output);
      }
    }

    return output;
  }

  getThreatPatterns(sensitivity = 'medium') {
    const low = [
      { type: 'xss', regex: /<\s*script\b|javascript:|onerror\s*=|onload\s*=/i },
      { type: 'sql_injection', regex: /(union\s+select|drop\s+table|information_schema|or\s+1=1|--|;\s*shutdown)/i }
    ];

    const highOnly = [
      { type: 'sql_injection', regex: /(sleep\s*\(|benchmark\s*\(|waitfor\s+delay|into\s+outfile)/i },
      { type: 'xss', regex: /<\s*iframe\b|<\s*svg\b|document\.cookie|window\.location/i }
    ];

    if (sensitivity === 'high') {
      return low.concat(highOnly);
    }

    if (sensitivity === 'low') {
      return low;
    }

    return low.concat([{ type: 'nosql_injection', regex: /(\$where|\$regex|\$ne|\$gt|\$lt)/i }]);
  }

  detectThreats(req, policy) {
    const threatPolicy = policy.threatDetection || {};
    if (!threatPolicy.enabled) {
      return { detected: false, matches: [] };
    }

    const values = [];
    this.flattenValues(req.query, values);
    this.flattenValues(req.params, values);
    this.flattenValues(req.body, values);
    values.push(req.originalUrl || '');
    values.push(req.headers['user-agent'] || '');

    const patterns = this.getThreatPatterns(threatPolicy.sensitivity || 'medium');
    const matches = [];

    for (const rawValue of values) {
      for (const pattern of patterns) {
        if (pattern.regex.test(rawValue)) {
          matches.push({
            type: pattern.type,
            sample: rawValue.slice(0, 140)
          });
        }
      }
    }

    return {
      detected: matches.length > 0,
      matches
    };
  }

  blockOrLogThreat(req, res, policy, threatReport) {
    for (const threat of threatReport.matches) {
      securityMonitor.logSecurityEvent(req, 'gateway_threat_detected', {
        threatType: threat.type,
        sample: threat.sample,
        endpoint: req.originalUrl,
        method: req.method,
        policyId: policy.policyId || 'unknown'
      });
    }

    if (policy.threatDetection?.blockOnDetection) {
      res.status(403).json({
        success: false,
        error: 'Request blocked by API gateway threat detection',
        code: 'GATEWAY_THREAT_BLOCKED',
        threats: threatReport.matches.map((threat) => threat.type)
      });
      return false;
    }

    return true;
  }

  logRequest(req, res, policy, startedAt, context = {}) {
    const durationMs = Date.now() - startedAt;
    const logEntry = {
      timestamp: new Date().toISOString(),
      gateway: true,
      endpoint: req.originalUrl,
      method: req.method,
      policyId: policy.policyId || 'default',
      statusCode: res.statusCode,
      durationMs,
      ip: this.getClientIp(req),
      authType: req.gatewayAuth?.type || null,
      blocked: Boolean(context.blocked),
      threatDetected: Boolean(context.threatDetected),
      riskScore: context.risk?.riskScore,
      enforcementTier: context.risk?.tier,
      riskMode: context.risk?.enforcement?.mode,
      sensitivityTag: context.risk?.sensitivityTag,
      riskLatencyMs: context.risk?.latencyMs,
      correlationId: context.risk?.correlationId || this.getCorrelationId(req)
    };

    console.log('API_GATEWAY_LOG', JSON.stringify(logEntry));
  }

  recordRiskDecision(req, res, policy, riskResult, context = {}) {
    const decision = {
      timestamp: new Date().toISOString(),
      correlationId: riskResult.correlationId,
      requestId: req.headers['x-request-id'] || req.auditContext?.requestId || null,
      forensicTraceId: req.forensicTraceId || null,
      endpoint: req.originalUrl,
      method: req.method,
      ip: this.getClientIp(req),
      actorKey: riskResult.actorKey,
      policyId: policy.policyId || 'default',
      sensitivityTag: riskResult.sensitivityTag,
      riskScore: riskResult.riskScore,
      enforcementTier: riskResult.tier,
      enforcementMode: riskResult.enforcement?.mode,
      components: riskResult.components,
      thresholds: riskResult.thresholds,
      geoVelocity: riskResult.geoVelocity,
      latencyMs: riskResult.latencyMs,
      blocked: Boolean(context.blocked),
      threatDetected: Boolean(context.threatDetected),
      statusCode: res.statusCode
    };

    this.riskDecisionTrail.push(decision);
    if (this.riskDecisionTrail.length > this.maxRiskDecisionTrail) {
      this.riskDecisionTrail.shift();
    }

    console.log('API_GATEWAY_RISK_DECISION', JSON.stringify(decision));
  }

  getRiskAuditTrail({ limit = 200, correlationId, actorKey, minTier } = {}) {
    const sanitizedLimit = Math.max(1, Math.min(2000, Number(limit) || 200));

    return this.riskDecisionTrail
      .filter((entry) => {
        if (correlationId && entry.correlationId !== correlationId) {
          return false;
        }
        if (actorKey && entry.actorKey !== actorKey) {
          return false;
        }
        if (Number.isFinite(Number(minTier)) && entry.enforcementTier < Number(minTier)) {
          return false;
        }
        return true;
      })
      .slice(-sanitizedLimit)
      .reverse();
  }

  getRiskHealth() {
    const sampleCount = this.latencySamples.length;
    const avgLatencyMs = sampleCount
      ? Number((this.latencySamples.reduce((sum, value) => sum + value, 0) / sampleCount).toFixed(2))
      : 0;
    const maxLatencyMs = sampleCount ? Math.max(...this.latencySamples) : 0;

    return {
      riskProfilesTracked: this.riskProfileStore.size,
      decisionsTracked: this.riskDecisionTrail.length,
      scoringLatency: {
        sampleCount,
        avgLatencyMs,
        maxLatencyMs,
        targetBudgetMs: 50
      }
    };
  }

  middleware() {
    return (req, res, next) => {
      const startedAt = Date.now();
      const policy = apiGatewayPolicyService.getPolicyForRequest(req);
      const riskResult = this.evaluateRisk(req, policy);

      res.on('finish', () => {
        this.logRequest(req, res, policy, startedAt, req.gatewayContext || {});
        this.recordRiskDecision(req, res, policy, riskResult, req.gatewayContext || {});
      });

      if (!this.enforceTierRestrictions(req, res, policy, riskResult)) {
        req.gatewayContext = { blocked: true, threatDetected: false, risk: riskResult };
        return;
      }

      if (!this.validateRequest(req, res, policy)) {
        req.gatewayContext = { blocked: true, threatDetected: false, risk: riskResult };
        return;
      }

      if (!this.applyRateLimit(req, res, policy, riskResult)) {
        req.gatewayContext = { blocked: true, threatDetected: false, risk: riskResult };
        securityMonitor.logSecurityEvent(req, 'gateway_rate_limit', {
          endpoint: req.originalUrl,
          method: req.method,
          policyId: policy.policyId || 'default',
          tier: riskResult.tier,
          riskScore: riskResult.riskScore,
          correlationId: riskResult.correlationId
        });
        return;
      }

      const threatReport = this.detectThreats(req, policy);
      if (threatReport.detected) {
        const allowed = this.blockOrLogThreat(req, res, policy, threatReport);
        req.gatewayContext = { blocked: !allowed, threatDetected: true, risk: riskResult };
        if (!allowed) {
          return;
        }
      }

      if (!this.enforceAuthentication(req, res, policy)) {
        req.gatewayContext = { blocked: true, threatDetected: threatReport.detected, risk: riskResult };
        securityMonitor.logSecurityEvent(req, 'gateway_auth_denied', {
          endpoint: req.originalUrl,
          method: req.method,
          policyId: policy.policyId || 'default',
          tier: riskResult.tier,
          riskScore: riskResult.riskScore,
          correlationId: riskResult.correlationId
        });
        return;
      }

      if (!this.enforceStepUpAuthentication(req, res, policy, riskResult)) {
        req.gatewayContext = { blocked: true, threatDetected: threatReport.detected, risk: riskResult };
        securityMonitor.logSecurityEvent(req, 'gateway_step_up_required', {
          endpoint: req.originalUrl,
          method: req.method,
          policyId: policy.policyId || 'default',
          tier: riskResult.tier,
          riskScore: riskResult.riskScore,
          correlationId: riskResult.correlationId
        });
        return;
      }

      req.gatewayPolicy = policy;
      req.gatewayRisk = riskResult;
      req.gatewayContext = { blocked: false, threatDetected: threatReport.detected, risk: riskResult };
      next();
    };
  }
}

module.exports = new ApiGateway();
module.exports.ApiGateway = ApiGateway;
