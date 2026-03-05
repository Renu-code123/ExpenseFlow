/**
 * Runway Alert Guard Middleware - Issue #798
 * Proactive circuit-breaking based on P10 runway exhaustion
 * Warns users when probabilistic simulations indicate danger
 */

const simulationEngine = require('../services/simulationEngine');
const forecastRepository = require('../repositories/forecastRepository');

class RunwayAlertGuard {
  constructor() {
    // Alert thresholds
    this.P10_CRITICAL_THRESHOLD = 7;  // Days - Critical if P10 runway < 7
    this.P10_WARNING_THRESHOLD = 14;  // Days - Warning if P10 runway < 14
    this.P10_CAUTION_THRESHOLD = 30;  // Days - Caution if P10 runway < 30
    
    this.EXHAUSTION_CRITICAL = 75;    // % - Critical if >75% chance of exhaustion
    this.EXHAUSTION_WARNING = 50;     // % - Warning if >50% chance
    
    // Cache for quick lookups
    this.alertCache = new Map();
    this.CACHE_TTL = 60 * 60 * 1000; // 1 hour
  }

  /**
   * Express middleware to attach runway alerts to request
   */
  middleware() {
    return async (req, res, next) => {
      if (!req.user?._id) {
        return next();
      }

      try {
        const alerts = await this.checkRunwayAlerts(req.user._id.toString());
        req.runwayAlerts = alerts;
        
        // Attach to response headers for client awareness
        if (alerts.level !== 'safe') {
          res.setHeader('X-Runway-Alert-Level', alerts.level);
          res.setHeader('X-Runway-P10-Days', alerts.p10Runway || 'N/A');
        }
        
        next();
      } catch (error) {
        // Don't block the request on alert check failure
        console.error('[RunwayAlertGuard] Error checking alerts:', error.message);
        req.runwayAlerts = { level: 'unknown', error: true };
        next();
      }
    };
  }

  /**
   * Check runway alerts for a user
   * Uses cached simulation results when available
   */
  async checkRunwayAlerts(userId) {
    // Check cache first
    const cached = this.getCached(userId);
    if (cached) {
      return cached;
    }

    // Try to get recent simulation results from repository
    const scenarios = await forecastRepository.getUserScenarios(userId, { limit: 1 });
    
    let simulationData = null;
    
    if (scenarios.length > 0 && scenarios[0].lastResultSnapshot) {
      const lastRun = scenarios[0].lastRunAt;
      const hoursSinceRun = (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceRun < 24) {
        // Use cached results if less than 24 hours old
        simulationData = scenarios[0].lastResultSnapshot;
      }
    }

    // If no recent results, run a quick simulation
    if (!simulationData) {
      const quickResult = await simulationEngine.quickSimulation(userId, 1000);
      simulationData = {
        summary: quickResult.summary,
        confidenceIntervals: quickResult.confidenceIntervals
      };
    }

    const alerts = this.evaluateAlerts(simulationData);
    this.setCache(userId, alerts);
    
    return alerts;
  }

  /**
   * Evaluate alerts based on simulation data
   */
  evaluateAlerts(simulationData) {
    const { summary, confidenceIntervals } = simulationData;
    
    if (!confidenceIntervals || !summary) {
      return {
        level: 'unknown',
        message: 'Unable to calculate runway alerts',
        recommendations: []
      };
    }

    const p10Runway = confidenceIntervals.P10?.runway;
    const p50Runway = confidenceIntervals.P50?.runway;
    const exhaustionProb = summary.riskMetrics?.exhaustionProbability || 0;
    
    let level = 'safe';
    let message = '';
    const recommendations = [];
    const flags = [];

    // Check P10 runway thresholds
    if (p10Runway !== undefined) {
      if (p10Runway < this.P10_CRITICAL_THRESHOLD) {
        level = 'critical';
        message = `Critical: In worst-case scenarios, your funds could be exhausted in ${p10Runway} days`;
        flags.push('p10_critical');
        recommendations.push('Immediately review and cut non-essential expenses');
        recommendations.push('Consider emergency income sources');
        recommendations.push('Prioritize high-value payments');
      } else if (p10Runway < this.P10_WARNING_THRESHOLD) {
        level = 'warning';
        message = `Warning: Worst-case runway is only ${p10Runway} days`;
        flags.push('p10_warning');
        recommendations.push('Review upcoming expenses and delay non-critical purchases');
        recommendations.push('Build a small emergency buffer');
      } else if (p10Runway < this.P10_CAUTION_THRESHOLD) {
        level = 'caution';
        message = `Caution: Some scenarios show runway below 30 days`;
        flags.push('p10_caution');
        recommendations.push('Monitor your spending patterns');
        recommendations.push('Consider increasing savings rate');
      }
    }

    // Check exhaustion probability
    if (exhaustionProb >= this.EXHAUSTION_CRITICAL && level !== 'critical') {
      level = 'critical';
      message = `Critical: ${Math.round(exhaustionProb)}% probability of running out of funds`;
      flags.push('exhaustion_critical');
      recommendations.unshift('High probability of fund exhaustion - take immediate action');
    } else if (exhaustionProb >= this.EXHAUSTION_WARNING && level === 'safe') {
      level = 'warning';
      message = `Warning: ${Math.round(exhaustionProb)}% chance of exhausting funds within forecast period`;
      flags.push('exhaustion_warning');
      recommendations.push('Reduce variable spending to lower exhaustion risk');
    }

    // Add comparison to median runway
    if (p50Runway && p10Runway && level !== 'safe') {
      const variance = p50Runway - p10Runway;
      if (variance > 30) {
        recommendations.push(`Your runway varies significantly (${p10Runway}-${p50Runway} days) - reduce income/expense volatility`);
      }
    }

    return {
      level,
      message: message || 'Your financial runway looks healthy',
      p10Runway,
      p50Runway,
      exhaustionProbability: exhaustionProb,
      flags,
      recommendations: recommendations.slice(0, 5), // Max 5 recommendations
      evaluatedAt: new Date()
    };
  }

  /**
   * Circuit breaker - can block certain operations if runway is critical
   */
  circuitBreaker(options = {}) {
    const { blockExpenses = false, blockSubscriptions = true, warnOnly = true } = options;

    return async (req, res, next) => {
      if (!req.runwayAlerts && req.user?._id) {
        req.runwayAlerts = await this.checkRunwayAlerts(req.user._id.toString());
      }

      const alerts = req.runwayAlerts;
      
      if (!alerts || alerts.level === 'safe' || alerts.level === 'unknown') {
        return next();
      }

      if (alerts.level === 'critical' && !warnOnly) {
        // Check what operation is being attempted
        const isExpenseCreate = req.path.includes('/expense') && req.method === 'POST';
        const isSubscriptionCreate = req.path.includes('/recurring') && req.method === 'POST';

        if (blockExpenses && isExpenseCreate) {
          return res.status(429).json({
            success: false,
            error: 'RUNWAY_CRITICAL',
            message: 'New expenses blocked due to critical runway status',
            alerts
          });
        }

        if (blockSubscriptions && isSubscriptionCreate) {
          return res.status(429).json({
            success: false,
            error: 'RUNWAY_CRITICAL',
            message: 'New subscriptions blocked due to critical runway status',
            alerts
          });
        }
      }

      // Warn but don't block
      if (alerts.level === 'critical' || alerts.level === 'warning') {
        res.setHeader('X-Runway-Warning', encodeURIComponent(alerts.message));
      }

      next();
    };
  }

  /**
   * Get cached alerts
   */
  getCached(userId) {
    const cached = this.alertCache.get(userId);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.alertCache.delete(userId);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Set cached alerts
   */
  setCache(userId, alerts) {
    this.alertCache.set(userId, {
      timestamp: Date.now(),
      data: alerts
    });
  }

  /**
   * Clear cache for a user (call after financial changes)
   */
  clearUserCache(userId) {
    this.alertCache.delete(userId);
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this.alertCache.clear();
  }
}

module.exports = new RunwayAlertGuard();
