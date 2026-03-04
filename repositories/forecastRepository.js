/**
 * Forecast Repository - Issue #798
 * Optimized retrieval for massive simulation result sets
 * Handles caching and batch operations for Monte Carlo results
 */

const ForecastScenario = require('../models/ForecastScenario');
const mongoose = require('mongoose');

class ForecastRepository {
  constructor() {
    this.resultCache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    this.MAX_CACHE_SIZE = 100;
  }

  /**
   * Get cached simulation result or null
   * @param {string} cacheKey - Cache key (userId + scenarioId + hash)
   * @returns {Object|null} Cached result or null
   */
  getCached(cacheKey) {
    const cached = this.resultCache.get(cacheKey);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.resultCache.delete(cacheKey);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Store simulation result in cache
   * @param {string} cacheKey - Cache key
   * @param {Object} data - Simulation result
   */
  setCache(cacheKey, data) {
    // Evict oldest entries if cache is full
    if (this.resultCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.resultCache.keys().next().value;
      this.resultCache.delete(oldestKey);
    }
    
    this.resultCache.set(cacheKey, {
      timestamp: Date.now(),
      data
    });
  }

  /**
   * Generate cache key for simulation parameters
   */
  generateCacheKey(userId, scenarioId, options) {
    const params = JSON.stringify({ userId, scenarioId, ...options });
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < params.length; i++) {
      const char = params.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sim_${userId}_${scenarioId || 'default'}_${hash}`;
  }

  /**
   * Create a new forecast scenario
   */
  async createScenario(userId, scenarioData) {
    const scenario = new ForecastScenario({
      ...scenarioData,
      user: userId
    });
    await scenario.save();
    return scenario;
  }

  /**
   * Get all scenarios for a user
   */
  async getUserScenarios(userId, options = {}) {
    const query = ForecastScenario.find({ user: userId });
    
    if (options.includeDefault) {
      query.or([{ user: userId }, { isDefault: true }]);
    }
    
    if (options.sortBy) {
      query.sort({ [options.sortBy]: options.sortOrder || -1 });
    } else {
      query.sort({ createdAt: -1 });
    }
    
    if (options.limit) {
      query.limit(options.limit);
    }
    
    return query.exec();
  }

  /**
   * Get a specific scenario by ID
   */
  async getScenarioById(scenarioId, userId) {
    return ForecastScenario.findOne({
      _id: scenarioId,
      $or: [{ user: userId }, { isDefault: true }]
    });
  }

  /**
   * Update scenario with last run results
   */
  async updateScenarioResults(scenarioId, results) {
    return ForecastScenario.findByIdAndUpdate(
      scenarioId,
      {
        lastRunAt: new Date(),
        lastResultSnapshot: {
          summary: results.summary,
          confidenceIntervals: results.confidenceIntervals,
          calculatedAt: results.metadata.calculatedAt
        }
      },
      { new: true }
    );
  }

  /**
   * Delete a scenario
   */
  async deleteScenario(scenarioId, userId) {
    return ForecastScenario.findOneAndDelete({
      _id: scenarioId,
      user: userId,
      isDefault: { $ne: true }
    });
  }

  /**
   * Get scenarios that need nightly simulation refresh
   * @param {number} staleHours - Hours since last run to consider stale
   */
  async getStaleScenariosForRefresh(staleHours = 24) {
    const staleDate = new Date();
    staleDate.setHours(staleDate.getHours() - staleHours);
    
    return ForecastScenario.find({
      $or: [
        { lastRunAt: { $lt: staleDate } },
        { lastRunAt: { $exists: false } }
      ]
    }).populate('user', '_id email');
  }

  /**
   * Batch update scenarios after nightly run
   */
  async batchUpdateResults(updates) {
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { _id: update.scenarioId },
        update: {
          $set: {
            lastRunAt: new Date(),
            lastResultSnapshot: update.results
          }
        }
      }
    }));
    
    return ForecastScenario.bulkWrite(bulkOps);
  }

  /**
   * Get aggregated scenario statistics for workspace
   */
  async getWorkspaceScenarioStats(workspaceUserIds) {
    return ForecastScenario.aggregate([
      {
        $match: {
          user: { $in: workspaceUserIds.map(id => new mongoose.Types.ObjectId(id)) }
        }
      },
      {
        $group: {
          _id: null,
          totalScenarios: { $sum: 1 },
          avgIterations: { $avg: '$config.iterationCount' },
          avgHorizon: { $avg: '$config.timeHorizonDays' },
          lastRunAt: { $max: '$lastRunAt' }
        }
      }
    ]);
  }

  /**
   * Clear all cached results
   */
  clearCache() {
    this.resultCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.resultCache.size,
      maxSize: this.MAX_CACHE_SIZE,
      ttlMs: this.CACHE_TTL
    };
  }

  /**
   * Store historical simulation result for trend analysis
   * Note: In production, this would write to a time-series DB
   */
  async storeHistoricalResult(userId, result) {
    // For now, we store in the scenario's lastResultSnapshot
    // In production, consider using TimescaleDB or InfluxDB
    const defaultScenario = await ForecastScenario.findOne({
      user: userId,
      isDefault: true
    });
    
    if (defaultScenario) {
      await this.updateScenarioResults(defaultScenario._id, result);
    }
    
    return true;
  }
}

module.exports = new ForecastRepository();
