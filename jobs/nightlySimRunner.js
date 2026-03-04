/**
 * Nightly Simulation Runner Job - Issue #798
 * Compute-intensive background task for workspace health projections
 * Runs Monte Carlo simulations for all users/workspaces overnight
 */

const simulationEngine = require('../services/simulationEngine');
const forecastRepository = require('../repositories/forecastRepository');
const User = require('../models/User');
const FinancialHealthScore = require('../models/FinancialHealthScore');

class NightlySimRunner {
  constructor() {
    this.BATCH_SIZE = 10; // Process users in batches
    this.NIGHTLY_ITERATIONS = 10000; // Full simulation for nightly runs
    this.WORKER_CONCURRENCY = 4; // Parallel simulation workers
    this.isRunning = false;
    this.lastRunStats = null;
  }

  /**
   * Main entry point for nightly simulation job
   * Called by scheduler (e.g., node-cron)
   */
  async run() {
    if (this.isRunning) {
      console.log('[NightlySimRunner] Job already running, skipping...');
      return { skipped: true };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const stats = {
      startedAt: new Date(),
      usersProcessed: 0,
      scenariosProcessed: 0,
      healthScoresUpdated: 0,
      errors: [],
      duration: 0
    };

    try {
      console.log('[NightlySimRunner] Starting nightly simulation run...');

      // Get all active users (in production, filter by subscription level, last activity, etc.)
      const activeUsers = await this.getActiveUsers();
      console.log(`[NightlySimRunner] Found ${activeUsers.length} active users`);

      // Process users in batches
      for (let i = 0; i < activeUsers.length; i += this.BATCH_SIZE) {
        const batch = activeUsers.slice(i, i + this.BATCH_SIZE);
        await this.processBatch(batch, stats);
        
        // Small delay between batches to prevent resource exhaustion
        if (i + this.BATCH_SIZE < activeUsers.length) {
          await this.delay(1000);
        }
      }

      stats.duration = Date.now() - startTime;
      this.lastRunStats = stats;
      
      console.log(`[NightlySimRunner] Completed. Processed ${stats.usersProcessed} users, ${stats.scenariosProcessed} scenarios in ${stats.duration}ms`);
      
      return stats;
    } catch (error) {
      console.error('[NightlySimRunner] Fatal error:', error);
      stats.errors.push({ type: 'fatal', message: error.message });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get list of active users for simulation
   */
  async getActiveUsers() {
    // Get users who have been active in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const users = await User.find({
        lastActiveAt: { $gte: thirtyDaysAgo }
      }).select('_id email').limit(1000);
      
      return users;
    } catch (error) {
      // If lastActiveAt field doesn't exist, get all users
      return User.find({}).select('_id email').limit(500);
    }
  }

  /**
   * Process a batch of users
   */
  async processBatch(users, stats) {
    const promises = users.map(user => this.processUser(user, stats));
    
    // Use Promise.allSettled to continue even if some fail
    const results = await Promise.allSettled(promises);
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        stats.errors.push({
          userId: users[index]._id.toString(),
          message: result.reason.message
        });
      }
    });
  }

  /**
   * Process a single user's simulations
   */
  async processUser(user, stats) {
    const userId = user._id.toString();
    
    try {
      // Run base simulation (no scenario adjustments)
      const baseResult = await simulationEngine.runSimulation(
        userId,
        null,
        { iterations: this.NIGHTLY_ITERATIONS, horizonDays: 90 }
      );
      
      // Store the result
      await forecastRepository.storeHistoricalResult(userId, baseResult);
      stats.usersProcessed++;

      // Run simulations for each user scenario
      const scenarios = await forecastRepository.getUserScenarios(userId);
      
      for (const scenario of scenarios) {
        try {
          const scenarioResult = await simulationEngine.runSimulation(
            userId,
            scenario,
            { iterations: Math.min(scenario.config?.iterationCount || 5000, 10000) }
          );
          
          await forecastRepository.updateScenarioResults(scenario._id, scenarioResult);
          stats.scenariosProcessed++;
        } catch (scenarioError) {
          stats.errors.push({
            userId,
            scenarioId: scenario._id.toString(),
            message: scenarioError.message
          });
        }
      }

      // Update financial health score with simulation variance
      await this.updateHealthScoreWithSimulation(userId, baseResult);
      stats.healthScoresUpdated++;

    } catch (error) {
      throw new Error(`User ${userId}: ${error.message}`);
    }
  }

  /**
   * Update FinancialHealthScore with simulation-derived risk metrics
   */
  async updateHealthScoreWithSimulation(userId, simulationResult) {
    const now = new Date();
    const period = {
      year: now.getFullYear(),
      month: now.getMonth() + 1
    };

    try {
      // Find or create health score for this period
      let healthScore = await FinancialHealthScore.findOne({
        userId,
        'period.year': period.year,
        'period.month': period.month
      });

      if (!healthScore) {
        // If no health score exists, we can't update it with simulation data
        // The health score should be created by the main health score calculator
        return;
      }

      // Extract simulation-based risk factors
      const simRisk = simulationResult.summary.riskMetrics;
      const confidence = simulationResult.confidenceIntervals;

      // Update risk assessment with simulation data
      const simulationRiskFactors = [];
      
      if (simRisk.exhaustionProbability > 50) {
        simulationRiskFactors.push({
          category: 'cashflow',
          risk: 'High runway exhaustion probability',
          impact: simRisk.exhaustionProbability > 75 ? 'critical' : 'high',
          probability: simRisk.exhaustionProbability > 75 ? 'likely' : 'possible',
          mitigation: 'Reduce expenses or increase income to improve runway'
        });
      }

      if (confidence.P10.runway < 30) {
        simulationRiskFactors.push({
          category: 'liquidity',
          risk: 'Worst-case runway below 30 days',
          impact: confidence.P10.runway < 14 ? 'critical' : 'high',
          probability: 'possible',
          mitigation: 'Build emergency fund to extend runway in adverse scenarios'
        });
      }

      if (Math.abs(simRisk.expectedShortfall) > simulationResult.summary.currentBalance * 0.5) {
        simulationRiskFactors.push({
          category: 'volatility',
          risk: 'High expected shortfall in tail scenarios',
          impact: 'high',
          probability: 'unlikely',
          mitigation: 'Stabilize income sources and reduce variable expenses'
        });
      }

      // Update the health score document
      await FinancialHealthScore.findByIdAndUpdate(healthScore._id, {
        $set: {
          'simulationMetrics': {
            runwayP10: confidence.P10.runway,
            runwayP50: confidence.P50.runway,
            runwayP90: confidence.P90.runway,
            exhaustionProbability: simRisk.exhaustionProbability,
            valueAtRisk: simRisk.valueAtRisk,
            expectedShortfall: simRisk.expectedShortfall,
            lastSimulatedAt: new Date()
          }
        },
        $push: {
          'riskAssessment.factors': {
            $each: simulationRiskFactors,
            $slice: -20 // Keep only last 20 risk factors
          }
        }
      });

    } catch (error) {
      console.error(`[NightlySimRunner] Failed to update health score for user ${userId}:`, error.message);
    }
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get last run statistics
   */
  getLastRunStats() {
    return this.lastRunStats;
  }

  /**
   * Check if job is currently running
   */
  isJobRunning() {
    return this.isRunning;
  }

  /**
   * Manual trigger for testing
   */
  async triggerManual(userId = null) {
    if (userId) {
      // Run for specific user only
      const stats = { usersProcessed: 0, scenariosProcessed: 0, healthScoresUpdated: 0, errors: [] };
      await this.processUser({ _id: userId }, stats);
      return stats;
    }
    return this.run();
  }
}

module.exports = new NightlySimRunner();
