/**
 * Predictive Analytics Engine for Financial Goals
 * 
 * This service calculates goal completion forecasts based on historical
 * transaction data, providing velocity calculations and estimated completion dates.
 */

const Expense = require('../models/Expense');
const Goal = require('../models/Goal');
const logger = require('../utils/logger');

class GoalsPredictiveEngine {
  constructor() {
    this.MIN_TRANSACTIONS_FOR_VELOCITY = 3;
    this.MIN_MONTHS_FOR_TREND = 2;
    this.CONFIDENCE_THRESHOLD_HIGH = 0.8;
    this.CONFIDENCE_THRESHOLD_MEDIUM = 0.5;
  }

  /**
   * Calculate savings velocity from transaction history
   * @param {string} userId - User ID
   * @param {number} monthsBack - Number of months to analyze (default: 6)
   * @returns {Object} Velocity metrics
   */
  async calculateSavingsVelocity(userId, monthsBack = 6) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - monthsBack);

      // Fetch transactions for the period
      const transactions = await Expense.find({
        user: userId,
        date: { $gte: startDate, $lte: endDate },
        type: { $in: ['income', 'expense'] }
      }).sort({ date: 1 });

      if (transactions.length < this.MIN_TRANSACTIONS_FOR_VELOCITY) {
        return {
          hasEnoughData: false,
          monthlySavingsRate: 0,
          averageIncome: 0,
          averageExpenses: 0,
          confidence: 0,
          message: 'Insufficient transaction data for velocity calculation'
        };
      }

      // Group transactions by month
      const monthlyData = this._groupTransactionsByMonth(transactions);
      const monthlySavings = Object.values(monthlyData).map(month => month.income - month.expenses);

      // Calculate velocity metrics
      const averageMonthlySavings = monthlySavings.reduce((a, b) => a + b, 0) / monthlySavings.length;
      const averageIncome = Object.values(monthlyData).reduce((sum, m) => sum + m.income, 0) / Object.keys(monthlyData).length;
      const averageExpenses = Object.values(monthlyData).reduce((sum, m) => sum + m.expenses, 0) / Object.keys(monthlyData).length;

      // Calculate trend (are savings improving?)
      const trend = this._calculateTrend(monthlySavings);

      // Calculate confidence based on data consistency
      const confidence = this._calculateConfidence(monthlySavings);

      return {
        hasEnoughData: true,
        monthlySavingsRate: averageMonthlySavings,
        averageIncome: averageIncome,
        averageExpenses: averageExpenses,
        monthsAnalyzed: Object.keys(monthlyData).length,
        transactionCount: transactions.length,
        trend: trend,
        confidence: confidence,
        monthlyBreakdown: monthlyData
      };
    } catch (error) {
      logger.error('Error calculating savings velocity:', error);
      throw error;
    }
  }

  /**
   * Generate forecast for a specific goal
   * @param {Object} goal - Goal object
   * @param {Object} velocity - Velocity metrics from calculateSavingsVelocity
   * @returns {Object} Forecast data
   */
  generateGoalForecast(goal, velocity) {
    const remainingAmount = goal.targetAmount - goal.currentAmount;

    // If goal is already completed
    if (remainingAmount <= 0) {
      return {
        isCompleted: true,
        estimatedCompletionDate: new Date(),
        monthsToCompletion: 0,
        onTrack: true,
        confidence: 1.0,
        message: 'Goal already achieved!'
      };
    }

    // If no velocity data or negative savings rate
    if (!velocity.hasEnoughData || velocity.monthlySavingsRate <= 0) {
      return {
        isCompleted: false,
        estimatedCompletionDate: null,
        monthsToCompletion: null,
        onTrack: false,
        confidence: velocity.confidence || 0,
        message: velocity.monthlySavingsRate <= 0 
          ? 'Current spending exceeds income. Unable to forecast completion.'
          : 'Insufficient data to predict completion date.',
        recommendation: 'Continue tracking transactions to enable predictions.'
      };
    }

    // Calculate months to completion
    const monthsToCompletion = remainingAmount / velocity.monthlySavingsRate;
    const estimatedCompletionDate = new Date();
    estimatedCompletionDate.setMonth(estimatedCompletionDate.getMonth() + Math.ceil(monthsToCompletion));

    // Determine if on track compared to target date
    const targetDate = new Date(goal.targetDate);
    const isOnTrack = estimatedCompletionDate <= targetDate;

    // Calculate probability of success
    const timeBuffer = (targetDate - estimatedCompletionDate) / (1000 * 60 * 60 * 24); // days
    const probabilityOfSuccess = this._calculateSuccessProbability(
      monthsToCompletion,
      timeBuffer,
      velocity.confidence,
      velocity.trend
    );

    return {
      isCompleted: false,
      estimatedCompletionDate: estimatedCompletionDate,
      monthsToCompletion: Math.ceil(monthsToCompletion),
      daysToCompletion: Math.ceil(monthsToCompletion * 30),
      onTrack: isOnTrack,
      aheadByDays: isOnTrack ? Math.floor(timeBuffer) : 0,
      behindByDays: !isOnTrack ? Math.floor(Math.abs(timeBuffer)) : 0,
      confidence: velocity.confidence,
      probabilityOfSuccess: probabilityOfSuccess,
      monthlySavingsRate: velocity.monthlySavingsRate,
      trend: velocity.trend,
      recommendation: this._generateRecommendation(isOnTrack, velocity.trend, monthsToCompletion),
      message: this._generateForecastMessage(isOnTrack, estimatedCompletionDate, targetDate)
    };
  }

  /**
   * Get predictive analytics for all active goals of a user
   * @param {string} userId - User ID
   * @returns {Object} Analytics for all goals
   */
  async getGoalsAnalytics(userId) {
    try {
      // Get velocity metrics
      const velocity = await this.calculateSavingsVelocity(userId);

      // Get all active goals
      const goals = await Goal.find({
        user: userId,
        status: 'active',
        isActive: true
      });

      // Generate forecasts for each goal
      const goalForecasts = goals.map(goal => {
        const forecast = this.generateGoalForecast(goal, velocity);
        return {
          goalId: goal._id,
          title: goal.title,
          targetAmount: goal.targetAmount,
          currentAmount: goal.currentAmount,
          progress: goal.progress,
          targetDate: goal.targetDate,
          ...forecast
        };
      });

      // Sort by probability of success (ascending - most at risk first)
      goalForecasts.sort((a, b) => a.probabilityOfSuccess - b.probabilityOfSuccess);

      return {
        velocity: velocity,
        goals: goalForecasts,
        summary: this._generateSummary(goalForecasts, velocity)
      };
    } catch (error) {
      logger.error('Error getting goals analytics:', error);
      throw error;
    }
  }

  /**
   * Get quick forecast for a single goal
   * @param {string} goalId - Goal ID
   * @param {string} userId - User ID
   * @returns {Object} Forecast for the goal
   */
  async getGoalForecast(goalId, userId) {
    try {
      const goal = await Goal.findOne({ _id: goalId, user: userId });
      if (!goal) {
        throw new Error('Goal not found');
      }

      const velocity = await this.calculateSavingsVelocity(userId);
      const forecast = this.generateGoalForecast(goal, velocity);

      return {
        goal: {
          id: goal._id,
          title: goal.title,
          targetAmount: goal.targetAmount,
          currentAmount: goal.currentAmount,
          progress: goal.progress,
          targetDate: goal.targetDate,
          category: goal.category,
          goalType: goal.goalType
        },
        forecast: forecast
      };
    } catch (error) {
      logger.error('Error getting goal forecast:', error);
      throw error;
    }
  }

  /**
   * Group transactions by month for analysis
   * @private
   */
  _groupTransactionsByMonth(transactions) {
    const monthlyData = {};

    transactions.forEach(transaction => {
      const date = new Date(transaction.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expenses: 0, transactions: 0 };
      }

      if (transaction.type === 'income') {
        monthlyData[monthKey].income += transaction.amount;
      } else {
        monthlyData[monthKey].expenses += transaction.amount;
      }

      monthlyData[monthKey].transactions += 1;
    });

    return monthlyData;
  }

  /**
   * Calculate trend from monthly savings data
   * @private
   */
  _calculateTrend(monthlySavings) {
    if (monthlySavings.length < this.MIN_MONTHS_FOR_TREND) {
      return { direction: 'stable', strength: 0 };
    }

    // Simple linear regression to determine trend
    const n = monthlySavings.length;
    const sumX = monthlySavings.reduce((sum, _, i) => sum + i, 0);
    const sumY = monthlySavings.reduce((sum, val) => sum + val, 0);
    const sumXY = monthlySavings.reduce((sum, val, i) => sum + i * val, 0);
    const sumXX = monthlySavings.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    // Determine trend direction and strength
    const avgSavings = sumY / n;
    const trendStrength = Math.abs(slope) / (Math.abs(avgSavings) || 1);

    let direction = 'stable';
    if (slope > avgSavings * 0.1) direction = 'improving';
    else if (slope < -avgSavings * 0.1) direction = 'declining';

    return {
      direction: direction,
      strength: Math.min(trendStrength, 1),
      slope: slope,
      monthlyChange: slope
    };
  }

  /**
   * Calculate confidence score based on data consistency
   * @private
   */
  _calculateConfidence(monthlySavings) {
    if (monthlySavings.length < 2) return 0.3;

    // Calculate coefficient of variation (CV)
    const mean = monthlySavings.reduce((a, b) => a + b, 0) / monthlySavings.length;
    const variance = monthlySavings.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / monthlySavings.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean !== 0 ? stdDev / Math.abs(mean) : stdDev;

    // Convert CV to confidence (lower CV = higher confidence)
    // CV of 0 = 1.0 confidence, CV of 1 = 0.5 confidence, CV > 2 = 0.2 confidence
    let confidence = Math.max(0.2, 1 - (cv * 0.4));

    // Boost confidence with more data points
    const dataBoost = Math.min((monthlySavings.length - 2) * 0.05, 0.2);
    confidence = Math.min(confidence + dataBoost, 1);

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Calculate probability of achieving goal on time
   * @private
   */
  _calculateSuccessProbability(monthsToCompletion, timeBufferDays, confidence, trend) {
    let probability = confidence;

    // Adjust based on time buffer
    if (timeBufferDays > 30) {
      probability += 0.2; // Significant buffer
    } else if (timeBufferDays > 0) {
      probability += 0.1; // Small buffer
    } else if (timeBufferDays > -30) {
      probability -= 0.1; // Slightly behind
    } else {
      probability -= 0.3; // Significantly behind
    }

    // Adjust based on trend
    if (trend.direction === 'improving') {
      probability += trend.strength * 0.15;
    } else if (trend.direction === 'declining') {
      probability -= trend.strength * 0.2;
    }

    return Math.max(0, Math.min(1, Math.round(probability * 100) / 100));
  }

  /**
   * Generate recommendation based on forecast
   * @private
   */
  _generateRecommendation(isOnTrack, trend, monthsToCompletion) {
    if (!isOnTrack) {
      if (trend.direction === 'declining') {
        return 'Urgent: Your savings rate is declining. Review expenses and increase savings immediately.';
      }
      return 'Increase monthly savings to meet your target date. Consider reducing non-essential expenses.';
    }

    if (trend.direction === 'improving') {
      return 'Great progress! Your savings rate is improving. Keep up the momentum.';
    }

    if (monthsToCompletion > 12) {
      return 'Long-term goal on track. Maintain consistent savings habits.';
    }

    return 'On track! Continue your current savings strategy.';
  }

  /**
   * Generate human-readable forecast message
   * @private
   */
  _generateForecastMessage(isOnTrack, estimatedDate, targetDate) {
    const estDateStr = estimatedDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    const targetDateStr = targetDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });

    if (isOnTrack) {
      const daysEarly = Math.floor((targetDate - estimatedDate) / (1000 * 60 * 60 * 24));
      if (daysEarly > 30) {
        return `Ahead of schedule! Estimated completion by ${estDateStr} (${daysEarly} days before target).`;
      }
      return `On track to complete by ${estDateStr}.`;
    } else {
      const daysLate = Math.floor((estimatedDate - targetDate) / (1000 * 60 * 60 * 24));
      return `Behind schedule. Estimated completion by ${estDateStr} (${daysLate} days after target).`;
    }
  }

  /**
   * Generate summary statistics
   * @private
   */
  _generateSummary(goalForecasts, velocity) {
    const totalGoals = goalForecasts.length;
    const onTrackGoals = goalForecasts.filter(g => g.onTrack).length;
    const atRiskGoals = goalForecasts.filter(g => !g.onTrack && !g.isCompleted).length;
    const completedGoals = goalForecasts.filter(g => g.isCompleted).length;

    const avgProbability = goalForecasts.length > 0
      ? goalForecasts.reduce((sum, g) => sum + (g.probabilityOfSuccess || 0), 0) / goalForecasts.length
      : 0;

    return {
      totalGoals,
      onTrackGoals,
      atRiskGoals,
      completedGoals,
      averageSuccessProbability: Math.round(avgProbability * 100) / 100,
      overallStatus: atRiskGoals > onTrackGoals ? 'at-risk' : onTrackGoals > 0 ? 'on-track' : 'no-goals',
      hasVelocityData: velocity.hasEnoughData,
      monthlySavingsRate: velocity.monthlySavingsRate
    };
  }
}

module.exports = new GoalsPredictiveEngine();
