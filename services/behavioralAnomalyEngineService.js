const mongoose = require('mongoose');
const BehaviorBaseline = require('../models/BehaviorBaseline');
const BehaviorAnomalyLog = require('../models/BehaviorAnomalyLog');

class BehavioralAnomalyEngineService {
  constructor() {
    this.defaultConfig = {
      baselineWindowMs: 1000 * 60 * 60 * 24 * 7, // 7 days
      ewmaAlpha: 0.06, // exponential decay weight
      minSamplesForConfidence: 8,
      weights: {
        intervalVariance: 0.25,
        endpointEntropy: 0.25,
        privilegeSequence: 0.2,
        deviceChange: 0.15,
        timeOfDay: 0.15
      }
    };
  }

  normalize(value, min = 0, max = 1) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(min, Math.min(max, value));
  }

  entropyFromCounts(counts = {}) {
    const values = Object.values(counts || {});
    const total = values.reduce((s, v) => s + (v || 0), 0);
    if (!total) return 0;
    let ent = 0;
    for (const v of values) {
      const p = v / total;
      if (p > 0) ent -= p * Math.log2(p);
    }
    // Normalize by log2(N) where N is number of unique endpoints
    const n = Math.max(1, values.length);
    return ent / Math.log2(n + 1);
  }

  async getBaseline(userId) {
    const baseline = await BehaviorBaseline.findOne({ userId });
    return baseline;
  }

  async updateBaseline(userId, incoming = {}, config = {}) {
    config = { ...this.defaultConfig, ...(config || {}) };
    let baseline = await BehaviorBaseline.findOne({ userId });
    if (!baseline) {
      baseline = new BehaviorBaseline({ userId });
    }

    baseline.lastSeen = new Date();
    baseline.samples = (baseline.samples || 0) + 1;

    // Update EWMA fields: avgIntervalMs
    const alpha = Number(config.ewmaAlpha || this.defaultConfig.ewmaAlpha);
    if (incoming.intervalMs !== undefined && Number.isFinite(incoming.intervalMs)) {
      if (!baseline.avgIntervalMs) baseline.avgIntervalMs = incoming.intervalMs;
      baseline.avgIntervalMs = (alpha * incoming.intervalMs) + ((1 - alpha) * (baseline.avgIntervalMs || 0));
    }

    // Endpoint counts
    baseline.endpoints = baseline.endpoints || {};
    if (incoming.endpoint) {
      baseline.endpoints[incoming.endpoint] = (baseline.endpoints[incoming.endpoint] || 0) + 1;
    }

    // Privilege sequences: store last N privileges seen
    baseline.privilegeSeq = baseline.privilegeSeq || [];
    if (incoming.privilege) {
      baseline.privilegeSeq.push(incoming.privilege);
      if (baseline.privilegeSeq.length > 50) baseline.privilegeSeq.shift();
    }

    // Device fingerprint
    if (incoming.deviceFingerprint) {
      baseline.lastDeviceFingerprint = incoming.deviceFingerprint;
    }

    // Hours distribution
    baseline.hourDistribution = baseline.hourDistribution || {};
    if (incoming.hour !== undefined && incoming.hour !== null) {
      const h = Number(incoming.hour);
      baseline.hourDistribution[h] = (baseline.hourDistribution[h] || 0) + 1;
    }

    baseline.markModified('endpoints');
    baseline.markModified('privilegeSeq');
    baseline.markModified('hourDistribution');
    await baseline.save();
    return baseline;
  }

  computeIntervalVarianceScore(baseline, intervalMs) {
    if (!baseline || !baseline.avgIntervalMs) return 0;
    const ratio = Math.abs(intervalMs - baseline.avgIntervalMs) / Math.max(1, baseline.avgIntervalMs);
    // map ratio to 0..1 (cap at 5x)
    return this.normalize(ratio / 5, 0, 1);
  }

  computeEndpointEntropyScore(baseline, endpoint) {
    const counts = baseline?.endpoints || {};
    const ent = this.entropyFromCounts(counts);
    // If endpoint is rare, bump score
    const endpointCount = counts[endpoint] || 0;
    const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
    const rarity = 1 - (endpointCount / total);
    // combine entropy and rarity
    return this.normalize((ent * 0.6) + (rarity * 0.4), 0, 1);
  }

  computePrivilegeSequenceScore(baseline, privilege) {
    const seq = baseline?.privilegeSeq || [];
    if (!seq.length) return 0;
    // simple anomaly: privilege not seen in last N
    const seen = seq.includes(privilege);
    return seen ? 0 : 1;
  }

  computeDeviceChangeScore(baseline, deviceFingerprint) {
    if (!baseline || !baseline.lastDeviceFingerprint) return 0;
    return baseline.lastDeviceFingerprint === deviceFingerprint ? 0 : 1;
  }

  computeTimeOfDayScore(baseline, hour) {
    const dist = baseline?.hourDistribution || {};
    const total = Object.values(dist).reduce((s, v) => s + v, 0) || 0;
    if (!total) return 0;
    const p = (dist[hour] || 0) / total;
    // rare hour => higher score
    return this.normalize(1 - p, 0, 1);
  }

  buildExplainability(components) {
    return Object.entries(components)
      .map(([k, v]) => ({ key: k, value: Number(Number(v).toFixed(4)) }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }

  computeCombinedScore(components, weights) {
    const keys = Object.keys(weights);
    let total = 0;
    let weightSum = 0;
    for (const k of keys) {
      const w = Number(weights[k] || 0);
      total += (components[k] || 0) * w;
      weightSum += w;
    }
    if (weightSum <= 0) return 0;
    const normalized = total / weightSum; // 0..1
    return this.normalize(normalized, 0, 1) * 100; // 0..100
  }

  async evaluateRequest({ userId, requestId, sessionId, features = {}, config = {} }) {
    // features: { intervalMs, endpoint, privilege, deviceFingerprint, hour }
    config = { ...this.defaultConfig, ...(config || {}) };
    const baseline = await this.getBaseline(userId);

    const comps = {};
    comps.intervalVariance = this.computeIntervalVarianceScore(baseline, Number(features.intervalMs || 0));
    comps.endpointEntropy = this.computeEndpointEntropyScore(baseline, features.endpoint);
    comps.privilegeSequence = this.computePrivilegeSequenceScore(baseline, features.privilege);
    comps.deviceChange = this.computeDeviceChangeScore(baseline, features.deviceFingerprint);
    comps.timeOfDay = this.computeTimeOfDayScore(baseline, Number(features.hour));

    const score = this.computeCombinedScore(comps, config.weights || this.defaultConfig.weights);

    // Confidence: based on sample count and minSamples
    const samples = baseline?.samples || 0;
    const confidence = Math.min(0.99, Math.max(0.05, samples >= config.minSamplesForConfidence ? 0.9 : (samples / config.minSamplesForConfidence)));

    const explainability = this.buildExplainability(comps);

    // Persist anomaly log
    const log = await BehaviorAnomalyLog.create({
      userId,
      requestId,
      sessionId,
      score: Number(score.toFixed(2)),
      confidence: Number(confidence.toFixed(4)),
      explainability,
      features,
      baselineSnapshot: baseline ? {
        avgIntervalMs: baseline.avgIntervalMs,
        endpoints: baseline.endpoints,
        lastDeviceFingerprint: baseline.lastDeviceFingerprint
      } : null
    });

    // Update baseline asynchronously (do not block callers ideally)
    try {
      await this.updateBaseline(userId, features, config);
    } catch (e) {
      // swallow baseline update errors but log
      console.error('Baseline update error:', e && e.message);
    }

    return {
      userId,
      requestId,
      sessionId,
      score: log.score,
      confidence: log.confidence,
      explainability: log.explainability,
      logId: log._id
    };
  }
}

module.exports = new BehavioralAnomalyEngineService();
