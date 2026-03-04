/**
 * Budget Service
 * Handles budget operations with AI-driven self-healing capabilities
 */

const budgetRepository = require('../repositories/budgetRepository');
const expenseRepository = require('../repositories/expenseRepository');
const budgetIntelligenceService = require('./budgetIntelligenceService');
const intelligenceService = require('./intelligenceService');
const mongoose = require('mongoose');

const eventDispatcher = require('./eventDispatcher');
const stressTestEngine = require('./stressTestEngine');

class BudgetService {
  constructor() {
    this._initializeEventListeners();
  }

  /**
   * Get Stress-Adjusted Spending Limits
   * Issue #739: Dynamically reduces available budget if liquidity risk is high.
   */
  async getStressAdjustedLimits(workspaceId, budgetId) {
    const budget = await budgetRepository.findById(budgetId);
    if (!budget) throw new Error('Budget not found');

    const evaluation = await stressTestEngine.evaluateLiquidity(workspaceId);

    // Scale factor: If ruin probability is 10%, we reduce budget by 20%
    const riskAdjustmentFactor = Math.max(1 - (evaluation.maxRuinProbability * 2), 0.5);
    const adjustedLimit = budget.amount * riskAdjustmentFactor;

    return {
      originalLimit: budget.amount,
      adjustedLimit,
      riskFactor: 1 - riskAdjustmentFactor,
      stressStatus: evaluation.status
    };
  }

  _initializeEventListeners() {
    eventDispatcher.on('transaction:validated', async ({ transaction, userId }) => {
      try {
        const amount = transaction.convertedAmount || transaction.amount;
        // Impact budget & goals only for validated transactions
        if (transaction.type === 'expense') {
          await this.checkBudgetAlerts(userId);
        }
        await this.updateGoalProgress(
          userId,
          transaction.type === 'expense' ? -amount : amount,
          transaction.category
        );
        console.log(`[BudgetService] Updated impact for transaction ${transaction._id}`);
      } catch (err) {
        console.error('[BudgetService] Failed to process transaction event:', err);
      }
    });
  }

  /**
   * Check budget alerts for a user
   */
  async checkBudgetAlerts(userId) {
    try {
      const budgets = await budgetRepository.findActiveByUser(userId);
      const alerts = [];
      const now = new Date();

      for (const budget of budgets) {
        const usagePercent = budget.usagePercent;

        // Standard threshold alerts
        if (usagePercent >= 100) {
          alerts.push({
            type: 'exceeded',
            severity: 'critical',
            budgetId: budget._id,
            category: budget.category,
            name: budget.name,
            amount: budget.amount,
            spent: budget.spent,
            usagePercent: Math.round(usagePercent * 10) / 10,
            message: `Budget "${budget.name}" has been exceeded! Spent ${budget.spent} of ${budget.amount}`
          });
        } else if (usagePercent >= budget.alertThreshold) {
          alerts.push({
            type: 'warning',
            severity: 'high',
            budgetId: budget._id,
            category: budget.category,
            name: budget.name,
            amount: budget.amount,
            spent: budget.spent,
            usagePercent: Math.round(usagePercent * 10) / 10,
            message: `Budget "${budget.name}" is at ${Math.round(usagePercent)}% usage`
          });
        }

        // Predictive burn rate alerts (Early Warning System)
        try {
          const exhaustionPrediction = await intelligenceService.predictBudgetExhaustion(userId, budget._id);

          if (exhaustionPrediction.willExceedBudget && exhaustionPrediction.status !== 'safe') {
            alerts.push({
              type: 'predictive',
              severity: exhaustionPrediction.severity,
              budgetId: budget._id,
              category: budget.category,
              name: budget.name,
              amount: budget.amount,
              spent: exhaustionPrediction.spent,
              remaining: exhaustionPrediction.remaining,
              usagePercent: exhaustionPrediction.percentage,
              dailyBurnRate: exhaustionPrediction.dailyBurnRate,
              predictedExhaustionDate: exhaustionPrediction.predictedExhaustionDate,
              daysUntilExhaustion: exhaustionPrediction.daysUntilExhaustion,
              projectedEndAmount: exhaustionPrediction.projectedEndAmount,
              message: exhaustionPrediction.message
            });
          }
        } catch (predictionError) {
          console.error(`[BudgetService] Prediction error for budget ${budget._id}:`, predictionError);
        }

        // AI-driven anomaly alerts
        if (budget.intelligence.anomalyCount > 0) {
          const recentAnomalies = budget.intelligence.anomalies.filter(
            a => new Date(a.detectedAt) > new Date(now - 7 * 24 * 60 * 60 * 1000)
          );

          if (recentAnomalies.length > 0) {
            alerts.push({
              type: 'anomaly',
              severity: 'medium',
              budgetId: budget._id,
              category: budget.category,
              name: budget.name,
              anomalyCount: recentAnomalies.length,
              message: `${recentAnomalies.length} unusual transaction(s) detected in "${budget.name}" this week`
            });
          }
        }

        // Prediction-based alerts
        if (budget.intelligence.predictedSpend > budget.amount) {
          const predicted = budget.intelligence.predictedSpend;
          const confidence = budget.intelligence.predictionConfidence;

          if (confidence >= 60) {
            alerts.push({
              type: 'prediction',
              severity: 'medium',
              budgetId: budget._id,
              category: budget.category,
              name: budget.name,
              predictedSpend: predicted,
              confidence,
              message: `AI predicts "${budget.name}" will exceed budget (${confidence}% confidence)`
            });
          }
        }

        // Pending reallocation suggestions
        const pendingReallocations = budget.intelligence.reallocations.filter(
          r => r.status === 'pending'
        );

        if (pendingReallocations.length > 0) {
          alerts.push({
            type: 'reallocation',
            severity: 'info',
            budgetId: budget._id,
            category: budget.category,
            name: budget.name,
            suggestions: pendingReallocations.length,
            message: `${pendingReallocations.length} fund reallocation suggestion(s) available for "${budget.name}"`
          });
        }
      }

      // Sort by severity
      const severityOrder = { critical: 1, high: 2, medium: 3, low: 4, info: 5 };
      alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      return { alerts };
    } catch (error) {
      console.error('[BudgetService] Check alerts error:', error);
      return { alerts: [], error: error.message };
    }
  }

  /**
   * Update goal progress and spending history
   */
  async updateGoalProgress(userId, amount, category) {
    try {
      // Find active budget for this category
      const budget = await budgetRepository.findOne({
        user: userId,
        category,
        isActive: true
      });

      if (!budget) {
        return { success: false, message: 'No active budget for category' };
      }

      // Update spent amount
      budget.spent = (budget.spent || 0) + amount;
      budget.lastCalculated = new Date();

      // Add to spending history
      const currentPeriod = this.getCurrentPeriod(budget.period);
      budget.addSpendingRecord(amount, currentPeriod);

      // Trigger intelligence update
      await budgetRepository.updateById(budget._id, budget);
      await budgetIntelligenceService.processBudgetIntelligence(budget);

      // Analyze transaction for anomalies
      const anomalyCheck = await budgetIntelligenceService.analyzeTransaction(userId, {
        amount,
        category,
        description: 'Expense update',
        _id: new mongoose.Types.ObjectId()
      });

      return {
        success: true,
        budget: {
          category: budget.category,
          spent: budget.spent,
          amount: budget.amount,
          remaining: budget.remaining,
          usagePercent: budget.usagePercent
        },
        anomaly: anomalyCheck.isAnomaly ? anomalyCheck : null
      };
    } catch (error) {
      console.error('[BudgetService] Update progress error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current period string based on budget period type
   */
  getCurrentPeriod(periodType) {
    const now = new Date();
    switch (periodType) {
      case 'weekly':
        const weekNum = Math.ceil((now.getDate() - now.getDay() + 7) / 7);
        return `${now.getFullYear()}-W${weekNum}`;
      case 'yearly':
        return `${now.getFullYear()}`;
      case 'monthly':
      default:
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  /**
   * Recalculate all budget spending from transactions
   */
  async recalculateBudgets(userId) {
    try {
      const budgets = await budgetRepository.findActiveByUser(userId);
      const results = [];

      for (const budget of budgets) {
        const spent = await expenseRepository.aggregate([
          {
            $match: {
              user: new mongoose.Types.ObjectId(userId),
              category: budget.category,
              type: 'expense',
              date: { $gte: budget.startDate, $lte: budget.endDate }
            }
          },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        budget.spent = spent[0]?.total || 0;
        budget.lastCalculated = new Date();
        await budgetRepository.updateById(budget._id, budget);

        results.push({
          category: budget.category,
          spent: budget.spent,
          amount: budget.amount
        });
      }

      // Sync spending history
      await budgetIntelligenceService.syncSpendingHistory(userId);

      // Update intelligence for all budgets
      await budgetIntelligenceService.updateBudgetIntelligence(userId);

      return {
        success: true,
        budgets: results
      };
    } catch (error) {
      console.error('[BudgetService] Recalculate error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a new budget with intelligence initialization
   */
  async createBudget(userId, budgetData) {
    try {
      const budget = await budgetRepository.create({
        user: userId,
        ...budgetData,
        originalAmount: budgetData.amount,
        intelligence: {
          autoHealEnabled: budgetData.autoHealEnabled !== false,
          healingThreshold: budgetData.healingThreshold || 2
        }
      });

      // Sync historical data if available
      await budgetIntelligenceService.syncSpendingHistory(userId);
      await budgetIntelligenceService.processBudgetIntelligence(budget);

      return { success: true, budget };
    } catch (error) {
      console.error('[BudgetService] Create budget error:', error);
      throw error;
    }
  }

  /**
   * Get budgets with intelligence data
   */
  async getBudgetsWithIntelligence(userId) {
    try {
      const budgets = await budgetRepository.findAll(
        { user: userId, isActive: true },
        { sort: { category: 1 } }
      );

      return budgets.map(budget => ({
        _id: budget._id,
        name: budget.name,
        category: budget.category,
        amount: budget.amount,
        originalAmount: budget.originalAmount,
        spent: budget.spent,
        remaining: budget.remaining,
        usagePercent: Math.round(budget.usagePercent * 10) / 10,
        period: budget.period,
        alertThreshold: budget.alertThreshold,
        startDate: budget.startDate,
        endDate: budget.endDate,
        intelligence: {
          movingAverage: budget.intelligence.movingAverage,
          standardDeviation: budget.intelligence.standardDeviation,
          volatilityIndex: budget.intelligence.volatilityIndex,
          trendDirection: budget.intelligence.trendDirection,
          predictedSpend: budget.intelligence.predictedSpend,
          predictionConfidence: budget.intelligence.predictionConfidence,
          anomalyCount: budget.intelligence.anomalyCount,
          autoHealEnabled: budget.intelligence.autoHealEnabled,
          pendingReallocations: budget.intelligence.reallocations.filter(r => r.status === 'pending').length
        }
      }));
    } catch (error) {
      console.error('[BudgetService] Get budgets error:', error);
      throw error;
    }
  }
}

module.exports = new BudgetService();
