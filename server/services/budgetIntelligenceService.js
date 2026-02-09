/**
 * Budget Intelligence Service
 * AI-Driven Self-Healing Budgeting & Z-Score Anomaly Detection
 * Issue #339
 */

const Budget = require('../models/Budget');
const Expense = require('../models/Expense');
const mongoose = require('mongoose');

class BudgetIntelligenceService {
  constructor() {
    // Configuration
    this.Z_SCORE_THRESHOLD = 2.0; // Standard threshold for anomaly detection
    this.MINIMUM_DATA_POINTS = 5; // Minimum periods for reliable statistics
    this.MOVING_AVERAGE_WINDOW = 3; // Periods for moving average
    this.VOLATILITY_SENSITIVITY = 0.3; // Weight for volatility index
    this.REALLOCATION_BUFFER = 0.1; // 10% buffer for reallocations
  }

  /**
   * Calculate Z-Score for a given value
   * Z = (X - μ) / σ
   */
  calculateZScore(value, mean, stdDev) {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }

  /**
   * Calculate mean of an array
   */
  calculateMean(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Calculate standard deviation of an array
   */
  calculateStdDev(values, mean = null) {
    if (values.length < 2) return 0;
    const m = mean !== null ? mean : this.calculateMean(values);
    const squaredDiffs = values.map(val => Math.pow(val - m, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Calculate moving average
   */
  calculateMovingAverage(values, window = this.MOVING_AVERAGE_WINDOW) {
    if (values.length === 0) return 0;
    const slice = values.slice(-window);
    return this.calculateMean(slice);
  }

  /**
   * Calculate volatility index (0-100 scale)
   * Based on coefficient of variation
   */
  calculateVolatilityIndex(values) {
    if (values.length < 2) return 0;
    const mean = this.calculateMean(values);
    if (mean === 0) return 0;
    const stdDev = this.calculateStdDev(values, mean);
    const cv = (stdDev / mean) * 100;
    // Normalize to 0-100 scale (cap at 100)
    return Math.min(100, cv);
  }

  /**
   * Detect anomaly in a transaction
   */
  detectAnomaly(amount, mean, stdDev, threshold = this.Z_SCORE_THRESHOLD) {
    const zScore = this.calculateZScore(amount, mean, stdDev);
    return {
      isAnomaly: Math.abs(zScore) >= threshold,
      zScore,
      deviation: Math.abs(amount - mean),
      deviationPercent: mean > 0 ? ((amount - mean) / mean) * 100 : 0,
      severity: this.getAnomalySeverity(Math.abs(zScore))
    };
  }

  /**
   * Get anomaly severity level
   */
  getAnomalySeverity(absZScore) {
    if (absZScore >= 3) return 'critical';
    if (absZScore >= 2.5) return 'high';
    if (absZScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * Update budget intelligence statistics
   */
  async updateBudgetIntelligence(userId) {
    try {
      const budgets = await Budget.find({ user: userId, isActive: true });
      const results = [];

      for (const budget of budgets) {
        const result = await this.processBudgetIntelligence(budget);
        results.push(result);
      }

      return {
        success: true,
        processed: results.length,
        budgets: results
      };
    } catch (error) {
      console.error('[BudgetIntelligence] Update error:', error);
      throw error;
    }
  }

  /**
   * Process intelligence for a single budget
   */
  async processBudgetIntelligence(budget) {
    // Get historical spending data
    const historyAmounts = budget.intelligence.spendingHistory.map(h => h.amount);
    
    if (historyAmounts.length >= this.MINIMUM_DATA_POINTS) {
      // Calculate statistics
      const mean = this.calculateMean(historyAmounts);
      const stdDev = this.calculateStdDev(historyAmounts, mean);
      const movingAvg = this.calculateMovingAverage(historyAmounts);
      const volatility = this.calculateVolatilityIndex(historyAmounts);

      // Update intelligence fields
      budget.intelligence.movingAverage = Math.round(movingAvg * 100) / 100;
      budget.intelligence.standardDeviation = Math.round(stdDev * 100) / 100;
      budget.intelligence.volatilityIndex = Math.round(volatility * 10) / 10;

      // Calculate trend
      const recentAmounts = historyAmounts.slice(-3);
      const olderAmounts = historyAmounts.slice(-6, -3);
      if (recentAmounts.length > 0 && olderAmounts.length > 0) {
        const recentAvg = this.calculateMean(recentAmounts);
        const olderAvg = this.calculateMean(olderAmounts);
        const diff = recentAvg - olderAvg;
        
        if (Math.abs(diff) < olderAvg * 0.05) {
          budget.intelligence.trendDirection = 'stable';
        } else if (diff > 0) {
          budget.intelligence.trendDirection = 'increasing';
        } else {
          budget.intelligence.trendDirection = 'decreasing';
        }
      }

      // Predict next period spending
      budget.intelligence.predictedSpend = this.predictNextSpend(historyAmounts, mean, stdDev);
      budget.intelligence.predictionConfidence = this.calculatePredictionConfidence(historyAmounts, stdDev, mean);
    }

    budget.intelligence.lastUpdated = new Date();
    await budget.save();

    return {
      category: budget.category,
      movingAverage: budget.intelligence.movingAverage,
      standardDeviation: budget.intelligence.standardDeviation,
      volatilityIndex: budget.intelligence.volatilityIndex,
      trendDirection: budget.intelligence.trendDirection,
      predictedSpend: budget.intelligence.predictedSpend,
      predictionConfidence: budget.intelligence.predictionConfidence
    };
  }

  /**
   * Predict next period spending using weighted moving average
   */
  predictNextSpend(historyAmounts, mean, stdDev) {
    if (historyAmounts.length < 3) return mean;

    // Use exponential weighted moving average
    const alpha = 0.3; // Smoothing factor
    let ewma = historyAmounts[0];
    
    for (let i = 1; i < historyAmounts.length; i++) {
      ewma = alpha * historyAmounts[i] + (1 - alpha) * ewma;
    }

    return Math.round(ewma * 100) / 100;
  }

  /**
   * Calculate prediction confidence based on variance
   */
  calculatePredictionConfidence(historyAmounts, stdDev, mean) {
    if (historyAmounts.length < this.MINIMUM_DATA_POINTS) return 30;
    if (mean === 0) return 50;

    // Coefficient of variation method
    const cv = stdDev / mean;
    // More data points = higher confidence
    const dataPointBonus = Math.min(20, historyAmounts.length * 2);
    // Lower variance = higher confidence
    const confidenceFromVariance = Math.max(0, 100 - (cv * 100));
    
    return Math.round(Math.min(95, confidenceFromVariance * 0.7 + dataPointBonus));
  }

  /**
   * Analyze transaction for anomalies in real-time
   */
  async analyzeTransaction(userId, transaction) {
    try {
      const { amount, category, description, _id } = transaction;
      
      // Get budget for this category
      const budget = await Budget.findOne({
        user: userId,
        category,
        isActive: true
      });

      if (!budget) {
        return { isAnomaly: false, message: 'No budget found for category' };
      }

      const historyAmounts = budget.intelligence.spendingHistory.map(h => h.amount);
      
      if (historyAmounts.length < this.MINIMUM_DATA_POINTS) {
        return { 
          isAnomaly: false, 
          message: 'Insufficient data for anomaly detection',
          dataPointsNeeded: this.MINIMUM_DATA_POINTS - historyAmounts.length
        };
      }

      const mean = budget.intelligence.movingAverage || this.calculateMean(historyAmounts);
      const stdDev = budget.intelligence.standardDeviation || this.calculateStdDev(historyAmounts, mean);

      const anomalyResult = this.detectAnomaly(amount, mean, stdDev);

      if (anomalyResult.isAnomaly) {
        // Record the anomaly
        budget.recordAnomaly(
          _id,
          amount,
          anomalyResult.zScore,
          `${description} - Z-Score: ${anomalyResult.zScore.toFixed(2)}`
        );
        budget.intelligence.lastAnomalyCheck = new Date();
        await budget.save();

        // Generate reallocation suggestions if overspending
        let reallocationSuggestions = [];
        if (anomalyResult.zScore > 0) {
          reallocationSuggestions = await this.generateReallocationSuggestions(
            userId, 
            category, 
            anomalyResult.deviation
          );
        }

        return {
          isAnomaly: true,
          ...anomalyResult,
          category,
          mean: Math.round(mean * 100) / 100,
          stdDev: Math.round(stdDev * 100) / 100,
          message: `Unusual spending detected: ${anomalyResult.severity} severity`,
          reallocationSuggestions
        };
      }

      return {
        isAnomaly: false,
        ...anomalyResult,
        category,
        message: 'Transaction within normal range'
      };
    } catch (error) {
      console.error('[BudgetIntelligence] Analyze transaction error:', error);
      throw error;
    }
  }

  /**
   * Generate self-healing reallocation suggestions
   */
  async generateReallocationSuggestions(userId, deficitCategory, deficitAmount) {
    try {
      const suggestions = [];
      
      // Get all active budgets for user
      const budgets = await Budget.find({
        user: userId,
        isActive: true,
        category: { $ne: deficitCategory }
      });

      // Find budgets with surplus
      const budgetsWithSurplus = budgets
        .filter(b => b.surplus > 0)
        .sort((a, b) => b.surplus - a.surplus);

      let remainingDeficit = deficitAmount;

      for (const srcBudget of budgetsWithSurplus) {
        if (remainingDeficit <= 0) break;

        // Calculate transferable amount (max 80% of surplus to maintain buffer)
        const transferable = Math.min(
          srcBudget.surplus * (1 - this.REALLOCATION_BUFFER),
          remainingDeficit
        );

        if (transferable >= 10) { // Minimum transfer threshold
          const suggestion = {
            fromCategory: srcBudget.category,
            fromBudgetId: srcBudget._id,
            toCategory: deficitCategory,
            suggestedAmount: Math.round(transferable * 100) / 100,
            availableSurplus: Math.round(srcBudget.surplus * 100) / 100,
            reason: `Cover overspending in ${deficitCategory}`,
            confidence: this.calculateReallocationConfidence(srcBudget),
            impact: {
              sourceUsageAfter: ((srcBudget.spent + transferable) / srcBudget.amount) * 100,
              remainingDeficitAfter: Math.max(0, remainingDeficit - transferable)
            }
          };

          suggestions.push(suggestion);
          remainingDeficit -= transferable;

          // Record suggestion in source budget
          srcBudget.suggestReallocation(
            deficitCategory,
            transferable,
            suggestion.reason,
            deficitAmount
          );
          await srcBudget.save();
        }
      }

      return {
        suggestions,
        totalDeficit: deficitAmount,
        coveredAmount: deficitAmount - remainingDeficit,
        uncoveredAmount: Math.max(0, remainingDeficit),
        fullyResolvable: remainingDeficit <= 0
      };
    } catch (error) {
      console.error('[BudgetIntelligence] Reallocation error:', error);
      throw error;
    }
  }

  /**
   * Calculate confidence for reallocation suggestion
   */
  calculateReallocationConfidence(budget) {
    let confidence = 50; // Base confidence

    // Higher surplus = higher confidence
    if (budget.usagePercent < 50) confidence += 25;
    else if (budget.usagePercent < 70) confidence += 15;
    else if (budget.usagePercent < 80) confidence += 5;

    // Lower volatility = higher confidence
    if (budget.intelligence.volatilityIndex < 20) confidence += 15;
    else if (budget.intelligence.volatilityIndex < 40) confidence += 10;

    // More history = higher confidence
    if (budget.intelligence.spendingHistory.length >= 6) confidence += 10;

    return Math.min(95, confidence);
  }

  /**
   * Apply reallocation (move funds between budgets)
   */
  async applyReallocation(userId, fromBudgetId, toBudgetId, amount) {
    try {
      const [fromBudget, toBudget] = await Promise.all([
        Budget.findOne({ _id: fromBudgetId, user: userId }),
        Budget.findOne({ _id: toBudgetId, user: userId })
      ]);

      if (!fromBudget || !toBudget) {
        throw new Error('Budget not found');
      }

      if (fromBudget.surplus < amount) {
        throw new Error('Insufficient surplus in source budget');
      }

      // Record adaptation history
      fromBudget.intelligence.adaptationHistory.push({
        previousAmount: fromBudget.amount,
        newAmount: fromBudget.amount - amount,
        reason: `Reallocation to ${toBudget.category}`
      });

      toBudget.intelligence.adaptationHistory.push({
        previousAmount: toBudget.amount,
        newAmount: toBudget.amount + amount,
        reason: `Reallocation from ${fromBudget.category}`
      });

      // Apply transfer
      fromBudget.amount -= amount;
      toBudget.amount += amount;

      // Update reallocation status
      const pendingSuggestion = fromBudget.intelligence.reallocations.find(
        r => r.toCategory === toBudget.category && r.status === 'pending'
      );
      if (pendingSuggestion) {
        pendingSuggestion.status = 'accepted';
      }

      await Promise.all([fromBudget.save(), toBudget.save()]);

      return {
        success: true,
        fromBudget: {
          category: fromBudget.category,
          newAmount: fromBudget.amount,
          newSurplus: fromBudget.surplus
        },
        toBudget: {
          category: toBudget.category,
          newAmount: toBudget.amount,
          newSurplus: toBudget.surplus
        },
        transferredAmount: amount
      };
    } catch (error) {
      console.error('[BudgetIntelligence] Apply reallocation error:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive intelligence dashboard data
   */
  async getIntelligenceDashboard(userId) {
    try {
      const budgets = await Budget.find({ user: userId, isActive: true });
      
      const categories = {};
      let totalAnomalies = 0;
      let totalPendingReallocations = 0;
      const volatilityData = [];
      const anomalyTimeline = [];
      const predictions = [];

      for (const budget of budgets) {
        const intel = budget.intelligence;
        
        categories[budget.category] = {
          budgetAmount: budget.amount,
          spent: budget.spent,
          remaining: budget.remaining,
          usagePercent: Math.round(budget.usagePercent * 10) / 10,
          movingAverage: intel.movingAverage,
          standardDeviation: intel.standardDeviation,
          volatilityIndex: intel.volatilityIndex,
          trendDirection: intel.trendDirection,
          anomalyCount: intel.anomalyCount,
          predictedSpend: intel.predictedSpend,
          predictionConfidence: intel.predictionConfidence,
          hasSurplus: budget.hasSurplus,
          surplus: budget.surplus,
          deficit: budget.deficit
        };

        totalAnomalies += intel.anomalyCount;
        
        // Collect pending reallocations
        const pending = intel.reallocations.filter(r => r.status === 'pending');
        totalPendingReallocations += pending.length;

        // Volatility data for chart
        volatilityData.push({
          category: budget.category,
          volatility: intel.volatilityIndex,
          trend: intel.trendDirection
        });

        // Recent anomalies
        const recentAnomalies = intel.anomalies.slice(-5).map(a => ({
          ...a,
          category: budget.category
        }));
        anomalyTimeline.push(...recentAnomalies);

        // Predictions
        if (intel.predictedSpend) {
          predictions.push({
            category: budget.category,
            predicted: intel.predictedSpend,
            confidence: intel.predictionConfidence,
            budgetAmount: budget.amount,
            willExceed: intel.predictedSpend > budget.amount
          });
        }
      }

      // Sort anomaly timeline by date
      anomalyTimeline.sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt));

      // Get pending reallocation suggestions across all budgets
      const pendingReallocations = budgets.flatMap(b => 
        b.intelligence.reallocations
          .filter(r => r.status === 'pending')
          .map(r => ({ ...r, fromBudgetId: b._id }))
      );

      return {
        summary: {
          totalBudgets: budgets.length,
          totalAnomalies,
          pendingReallocations: totalPendingReallocations,
          avgVolatility: volatilityData.length > 0 
            ? Math.round(volatilityData.reduce((sum, v) => sum + v.volatility, 0) / volatilityData.length * 10) / 10
            : 0
        },
        categories,
        volatilityData,
        anomalyTimeline: anomalyTimeline.slice(0, 20),
        predictions: predictions.sort((a, b) => b.confidence - a.confidence),
        reallocationSuggestions: pendingReallocations,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('[BudgetIntelligence] Dashboard error:', error);
      throw error;
    }
  }

  /**
   * Batch analyze recent transactions for anomalies
   */
  async batchAnalyzeTransactions(userId, since = null) {
    try {
      const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24h
      
      const transactions = await Expense.find({
        user: userId,
        date: { $gte: sinceDate },
        type: 'expense'
      }).sort({ date: -1 });

      const results = {
        analyzed: 0,
        anomalies: [],
        suggestions: []
      };

      for (const transaction of transactions) {
        const analysis = await this.analyzeTransaction(userId, transaction);
        results.analyzed++;
        
        if (analysis.isAnomaly) {
          results.anomalies.push({
            transaction: {
              id: transaction._id,
              description: transaction.description,
              amount: transaction.amount,
              category: transaction.category,
              date: transaction.date
            },
            analysis
          });
        }
      }

      return results;
    } catch (error) {
      console.error('[BudgetIntelligence] Batch analyze error:', error);
      throw error;
    }
  }

  /**
   * Update spending history from recent transactions
   */
  async syncSpendingHistory(userId) {
    try {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

      // Get monthly spending by category
      const monthlySpending = await Expense.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            type: 'expense',
            date: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              category: '$category',
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);

      // Update each budget's spending history
      const budgets = await Budget.find({ user: userId, isActive: true });
      
      for (const budget of budgets) {
        const categorySpending = monthlySpending.filter(
          s => s._id.category === budget.category
        );

        budget.intelligence.spendingHistory = categorySpending.map(s => ({
          period: `${s._id.year}-${String(s._id.month).padStart(2, '0')}`,
          amount: s.total,
          transactionCount: s.count,
          recordedAt: new Date()
        }));

        await budget.save();
      }

      return { synced: budgets.length };
    } catch (error) {
      console.error('[BudgetIntelligence] Sync history error:', error);
      throw error;
    }
  }
}

module.exports = new BudgetIntelligenceService();
