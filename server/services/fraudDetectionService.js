const FraudDetection = require('../models/FraudDetection');
const SecurityEvent = require('../models/SecurityEvent');
const DeviceFingerprint = require('../models/DeviceFingerprint');
const statistics = require('simple-statistics');

class FraudDetectionService {
  constructor() {
    this.riskThresholds = {
      low: 0.3,
      medium: 0.6,
      high: 0.8,
      critical: 0.9
    };
    this.blacklistedIPs = new Set();
    this.suspiciousPatterns = new Map();
  }

  init() {
    console.log('Fraud detection service initialized');
    this.loadThreatIntelligence();
  }

  async analyzeTransaction(transaction, userHistory, deviceInfo) {
    const riskFactors = [];
    let riskScore = 0;

    // Behavioral analysis
    const behavioralRisk = await this.analyzeBehavior(transaction, userHistory);
    riskScore += behavioralRisk.score * 0.4;
    riskFactors.push(...behavioralRisk.factors);

    // Amount analysis
    const amountRisk = this.analyzeAmount(transaction, userHistory);
    riskScore += amountRisk.score * 0.3;
    riskFactors.push(...amountRisk.factors);

    // Device analysis
    const deviceRisk = await this.analyzeDevice(deviceInfo, transaction.user);
    riskScore += deviceRisk.score * 0.2;
    riskFactors.push(...deviceRisk.factors);

    // Location analysis
    const locationRisk = this.analyzeLocation(deviceInfo, userHistory);
    riskScore += locationRisk.score * 0.1;
    riskFactors.push(...locationRisk.factors);

    const riskLevel = this.calculateRiskLevel(riskScore);
    const action = this.determineAction(riskLevel, riskScore);

    const fraudDetection = new FraudDetection({
      user: transaction.user,
      transaction: transaction._id,
      riskScore,
      riskLevel,
      detectionType: 'behavioral',
      riskFactors,
      behavioralAnalysis: behavioralRisk.analysis,
      deviceInfo,
      action
    });

    await fraudDetection.save();

    if (action === 'block') {
      await this.blockTransaction(transaction, fraudDetection);
    }

    return fraudDetection;
  }

  async analyzeBehavior(transaction, userHistory) {
    if (userHistory.length < 5) {
      return { score: 0.2, factors: [], analysis: {} };
    }

    const amounts = userHistory.map(t => t.amount);
    const times = userHistory.map(t => new Date(t.date).getHours());
    const categories = userHistory.map(t => t.category);

    const amountMean = statistics.mean(amounts);
    const amountStdDev = statistics.standardDeviation(amounts);
    const timeMean = statistics.mean(times);

    const amountZScore = Math.abs((transaction.amount - amountMean) / amountStdDev);
    const timeDeviation = Math.abs(new Date(transaction.date).getHours() - timeMean);
    const categoryFreq = categories.filter(c => c === transaction.category).length / categories.length;

    let score = 0;
    const factors = [];

    if (amountZScore > 3) {
      score += 0.4;
      factors.push({ factor: 'unusual_amount', weight: 0.4, description: 'Transaction amount significantly deviates from normal pattern' });
    }

    if (timeDeviation > 6) {
      score += 0.3;
      factors.push({ factor: 'unusual_time', weight: 0.3, description: 'Transaction time outside normal hours' });
    }

    if (categoryFreq < 0.1) {
      score += 0.2;
      factors.push({ factor: 'unusual_category', weight: 0.2, description: 'Rarely used expense category' });
    }

    return {
      score: Math.min(score, 1),
      factors,
      analysis: { amountZScore, timeDeviation, categoryFreq }
    };
  }

  analyzeAmount(transaction, userHistory) {
    const amounts = userHistory.map(t => t.amount);
    const maxAmount = Math.max(...amounts);
    const avgAmount = statistics.mean(amounts);

    let score = 0;
    const factors = [];

    if (transaction.amount > maxAmount * 2) {
      score += 0.6;
      factors.push({ factor: 'extremely_high_amount', weight: 0.6, description: 'Amount exceeds historical maximum by 2x' });
    } else if (transaction.amount > avgAmount * 5) {
      score += 0.4;
      factors.push({ factor: 'high_amount', weight: 0.4, description: 'Amount significantly higher than average' });
    }

    return { score, factors };
  }

  async analyzeDevice(deviceInfo, userId) {
    const existingDevice = await DeviceFingerprint.findOne({
      user: userId,
      fingerprint: deviceInfo.fingerprint
    });

    let score = 0;
    const factors = [];

    if (!existingDevice) {
      score += 0.5;
      factors.push({ factor: 'new_device', weight: 0.5, description: 'Transaction from unrecognized device' });
      
      // Create new device fingerprint
      await this.createDeviceFingerprint(userId, deviceInfo);
    } else {
      existingDevice.lastSeen = new Date();
      existingDevice.loginCount++;
      await existingDevice.save();

      if (existingDevice.trustScore < 0.3) {
        score += 0.3;
        factors.push({ factor: 'low_trust_device', weight: 0.3, description: 'Device has low trust score' });
      }
    }

    if (this.blacklistedIPs.has(deviceInfo.ipAddress)) {
      score += 0.8;
      factors.push({ factor: 'blacklisted_ip', weight: 0.8, description: 'IP address is blacklisted' });
    }

    return { score, factors };
  }

  analyzeLocation(deviceInfo, userHistory) {
    // Mock location analysis
    let score = 0;
    const factors = [];

    if (deviceInfo.location && deviceInfo.location.country !== 'US') {
      score += 0.3;
      factors.push({ factor: 'foreign_location', weight: 0.3, description: 'Transaction from foreign location' });
    }

    return { score, factors };
  }

  calculateRiskLevel(riskScore) {
    if (riskScore >= this.riskThresholds.critical) return 'critical';
    if (riskScore >= this.riskThresholds.high) return 'high';
    if (riskScore >= this.riskThresholds.medium) return 'medium';
    return 'low';
  }

  determineAction(riskLevel, riskScore) {
    switch (riskLevel) {
      case 'critical': return 'block';
      case 'high': return 'review';
      case 'medium': return 'flag';
      default: return 'allow';
    }
  }

  async blockTransaction(transaction, fraudDetection) {
    // Create security event
    await this.createSecurityEvent({
      user: transaction.user,
      eventType: 'suspicious_transaction',
      severity: 'high',
      source: 'fraud_detection',
      ipAddress: fraudDetection.deviceInfo.ipAddress
    });

    // Notify user
    global.io?.to(`user_${transaction.user}`).emit('fraud_alert', {
      message: 'Suspicious transaction blocked',
      riskScore: fraudDetection.riskScore
    });
  }

  async createDeviceFingerprint(userId, deviceInfo) {
    const fingerprint = new DeviceFingerprint({
      user: userId,
      fingerprint: deviceInfo.fingerprint,
      deviceInfo: deviceInfo,
      networkInfo: {
        ipAddress: deviceInfo.ipAddress,
        location: deviceInfo.location
      }
    });
    return await fingerprint.save();
  }

  async createSecurityEvent(eventData) {
    const securityEvent = new SecurityEvent(eventData);
    return await securityEvent.save();
  }

  loadThreatIntelligence() {
    // Mock threat intelligence loading
    this.blacklistedIPs.add('192.168.1.100');
    this.blacklistedIPs.add('10.0.0.1');
  }
}

module.exports = new FraudDetectionService();