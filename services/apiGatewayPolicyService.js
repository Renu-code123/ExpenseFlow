const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class ApiGatewayPolicyService extends EventEmitter {
  constructor(policyFilePath) {
    super();
    this.policyFilePath = policyFilePath || path.join(__dirname, '..', 'config', 'apiGatewayPolicies.json');
    this.policies = null;
    this.lastLoadedAt = null;
    this.watchEnabled = false;

    this.loadPolicies();
    this.startWatch();
  }

  getFallbackPolicies() {
    return {
      version: 'fallback',
      updatedAt: new Date().toISOString(),
      defaultPolicy: {
        policyId: 'default',
        authRequired: true,
        allowedAuth: ['jwt', 'oauth2'],
        requiredScopes: [],
        sensitivityTag: 'medium',
        rateLimit: {
          windowMs: 60000,
          max: 120
        },
        requestValidation: {
          allowedContentTypes: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'],
          requiredBodyFields: []
        },
        threatDetection: {
          enabled: true,
          blockOnDetection: true,
          sensitivity: 'medium'
        },
        adaptiveRisk: {
          enabled: true,
          overheadBudgetMs: 50,
          sensitivityTag: 'medium',
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
          }
        }
      },
      routePolicies: []
    };
  }

  loadPolicies() {
    try {
      if (!fs.existsSync(this.policyFilePath)) {
        this.policies = this.getFallbackPolicies();
        this.lastLoadedAt = new Date();
        return this.policies;
      }

      const raw = fs.readFileSync(this.policyFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.validatePolicyStructure(parsed);
      this.policies = parsed;
      this.lastLoadedAt = new Date();
      this.emit('reloaded', {
        version: parsed.version,
        loadedAt: this.lastLoadedAt.toISOString()
      });
      return this.policies;
    } catch (error) {
      this.emit('reload_error', { message: error.message, timestamp: new Date().toISOString() });
      if (!this.policies) {
        this.policies = this.getFallbackPolicies();
      }
      return this.policies;
    }
  }

  startWatch() {
    if (this.watchEnabled) {
      return;
    }

    this.watchEnabled = true;
    fs.watchFile(this.policyFilePath, { interval: 1500 }, () => {
      this.loadPolicies();
    });
  }

  stopWatch() {
    fs.unwatchFile(this.policyFilePath);
    this.watchEnabled = false;
  }

  validatePolicyStructure(policies) {
    if (!policies || typeof policies !== 'object') {
      throw new Error('Invalid policy document');
    }

    if (!policies.defaultPolicy || typeof policies.defaultPolicy !== 'object') {
      throw new Error('defaultPolicy is required');
    }

    if (!Array.isArray(policies.routePolicies)) {
      throw new Error('routePolicies must be an array');
    }

    this.validateAdaptiveRiskPolicy(policies.defaultPolicy.adaptiveRisk, 'defaultPolicy');

    for (const routePolicy of policies.routePolicies) {
      if (!routePolicy.pattern || typeof routePolicy.pattern !== 'string') {
        throw new Error('Each route policy requires a string pattern');
      }
      if (routePolicy.methods && !Array.isArray(routePolicy.methods)) {
        throw new Error(`Invalid methods for pattern ${routePolicy.pattern}`);
      }

      if (routePolicy.sensitivityTag) {
        const allowedTags = ['low', 'medium', 'high', 'critical'];
        if (!allowedTags.includes(String(routePolicy.sensitivityTag).toLowerCase())) {
          throw new Error(`Invalid sensitivityTag for pattern ${routePolicy.pattern}`);
        }
      }

      this.validateAdaptiveRiskPolicy(routePolicy.adaptiveRisk, `routePolicy:${routePolicy.pattern}`);
    }
  }

  validateAdaptiveRiskPolicy(adaptiveRisk, context = 'policy') {
    if (adaptiveRisk === undefined) {
      return;
    }

    if (!adaptiveRisk || typeof adaptiveRisk !== 'object') {
      throw new Error(`adaptiveRisk must be an object for ${context}`);
    }

    const thresholds = adaptiveRisk.thresholds;
    if (thresholds !== undefined) {
      const keys = ['tier1', 'tier2', 'tier3', 'tier4'];
      for (const key of keys) {
        if (thresholds[key] !== undefined && !Number.isFinite(Number(thresholds[key]))) {
          throw new Error(`adaptiveRisk.thresholds.${key} must be numeric for ${context}`);
        }
      }
    }

    const dynamicRateLimit = adaptiveRisk.dynamicRateLimit;
    if (dynamicRateLimit?.multipliers !== undefined && typeof dynamicRateLimit.multipliers !== 'object') {
      throw new Error(`adaptiveRisk.dynamicRateLimit.multipliers must be an object for ${context}`);
    }

    if (adaptiveRisk.stepUpAuth?.tiers !== undefined && !Array.isArray(adaptiveRisk.stepUpAuth.tiers)) {
      throw new Error(`adaptiveRisk.stepUpAuth.tiers must be an array for ${context}`);
    }
  }

  getPolicies() {
    if (!this.policies) {
      this.loadPolicies();
    }
    return this.policies;
  }

  mergePolicies(defaultPolicy, routePolicy = {}) {
    const merged = {
      ...defaultPolicy,
      ...routePolicy,
      rateLimit: {
        ...(defaultPolicy.rateLimit || {}),
        ...(routePolicy.rateLimit || {})
      },
      requestValidation: {
        ...(defaultPolicy.requestValidation || {}),
        ...(routePolicy.requestValidation || {})
      },
      threatDetection: {
        ...(defaultPolicy.threatDetection || {}),
        ...(routePolicy.threatDetection || {})
      },
      adaptiveRisk: {
        ...(defaultPolicy.adaptiveRisk || {}),
        ...(routePolicy.adaptiveRisk || {}),
        thresholds: {
          ...((defaultPolicy.adaptiveRisk || {}).thresholds || {}),
          ...((routePolicy.adaptiveRisk || {}).thresholds || {})
        },
        dynamicRateLimit: {
          ...((defaultPolicy.adaptiveRisk || {}).dynamicRateLimit || {}),
          ...((routePolicy.adaptiveRisk || {}).dynamicRateLimit || {}),
          multipliers: {
            ...(((defaultPolicy.adaptiveRisk || {}).dynamicRateLimit || {}).multipliers || {}),
            ...(((routePolicy.adaptiveRisk || {}).dynamicRateLimit || {}).multipliers || {})
          }
        },
        stepUpAuth: {
          ...((defaultPolicy.adaptiveRisk || {}).stepUpAuth || {}),
          ...((routePolicy.adaptiveRisk || {}).stepUpAuth || {})
        },
        geoVelocity: {
          ...((defaultPolicy.adaptiveRisk || {}).geoVelocity || {}),
          ...((routePolicy.adaptiveRisk || {}).geoVelocity || {})
        },
        behavior: {
          ...((defaultPolicy.adaptiveRisk || {}).behavior || {}),
          ...((routePolicy.adaptiveRisk || {}).behavior || {})
        },
        weights: {
          ...((defaultPolicy.adaptiveRisk || {}).weights || {}),
          ...((routePolicy.adaptiveRisk || {}).weights || {})
        },
        enforcement: {
          ...((defaultPolicy.adaptiveRisk || {}).enforcement || {}),
          ...((routePolicy.adaptiveRisk || {}).enforcement || {})
        }
      }
    };

    merged.allowedAuth = Array.isArray(merged.allowedAuth) ? merged.allowedAuth : ['jwt', 'oauth2'];
    merged.requiredScopes = Array.isArray(merged.requiredScopes) ? merged.requiredScopes : [];
    merged.requestValidation.requiredBodyFields = Array.isArray(merged.requestValidation.requiredBodyFields)
      ? merged.requestValidation.requiredBodyFields
      : [];

    return merged;
  }

  wildcardToRegex(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexPattern = `^${escaped.replace(/\*/g, '.*')}$`;
    return new RegExp(regexPattern, 'i');
  }

  isMethodMatch(routePolicy, method) {
    if (!Array.isArray(routePolicy.methods) || routePolicy.methods.length === 0) {
      return true;
    }
    return routePolicy.methods.map((m) => String(m).toUpperCase()).includes(String(method).toUpperCase());
  }

  getPolicyForRequest(req) {
    const policies = this.getPolicies();
    const defaultPolicy = policies.defaultPolicy || this.getFallbackPolicies().defaultPolicy;
    const requestPath = req.originalUrl.split('?')[0];

    const routePolicy = (policies.routePolicies || []).find((candidate) => {
      if (!this.isMethodMatch(candidate, req.method)) {
        return false;
      }
      const patternRegex = this.wildcardToRegex(candidate.pattern);
      return patternRegex.test(requestPath);
    });

    return this.mergePolicies(defaultPolicy, routePolicy || {});
  }

  updatePolicies(nextPolicies, options = {}) {
    this.validatePolicyStructure(nextPolicies);

    const payload = {
      ...nextPolicies,
      updatedAt: new Date().toISOString(),
      version: nextPolicies.version || this.getPolicies().version || '1.0.0'
    };

    if (options.bumpVersion === true) {
      const [major = 1, minor = 0, patch = 0] = String(payload.version)
        .split('.')
        .map((part) => parseInt(part, 10));
      payload.version = `${major}.${minor}.${Number.isFinite(patch) ? patch + 1 : 1}`;
    }

    fs.writeFileSync(this.policyFilePath, JSON.stringify(payload, null, 2), 'utf8');
    this.policies = payload;
    this.lastLoadedAt = new Date();

    this.emit('updated', {
      version: payload.version,
      updatedAt: payload.updatedAt
    });

    return payload;
  }

  getHealth() {
    return {
      loaded: Boolean(this.policies),
      watchEnabled: this.watchEnabled,
      policyPath: this.policyFilePath,
      lastLoadedAt: this.lastLoadedAt ? this.lastLoadedAt.toISOString() : null,
      version: this.getPolicies().version
    };
  }
}

module.exports = new ApiGatewayPolicyService();
module.exports.ApiGatewayPolicyService = ApiGatewayPolicyService;
