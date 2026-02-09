const Expense = require('../models/Expense');
const Budget = require('../models/Budget');
const Goal = require('../models/Goal');
const FinancialInsight = require('../models/FinancialInsight');
const AnalyticsCache = require('../models/AnalyticsCache');
const notificationService = require('./notificationService');
const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Smart Budget Forecasting & AI Financial Insights Service
 * Provides ML-based predictions, anomaly detection, health scoring, and recommendations
 */
class AIInsightsService {
  
  // ==================== EXPENSE FORECASTING ====================

  /**
   * Generate ML-based expense forecast using multiple methods
   */
  async generateForecast(userId, options = {}) {
    const { months = 3, useCache = true } = options;

    if (useCache) {
      const cached = await AnalyticsCache.getCache('ai_forecast', userId, { months });
      if (cached) return cached;
    }

    // Get historical data (12 months for better patterns)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const monthlyData = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: twelveMonthsAgo },
          type: 'expense'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          categories: { $push: '$category' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    if (monthlyData.length < 3) {
      return {
        success: false,
        message: 'Need at least 3 months of data for accurate forecasting',
        forecasts: null
      };
    }

    const amounts = monthlyData.map(m => m.total);
    
    // Apply multiple forecasting methods
    const forecasts = [];
    const now = new Date();

    for (let i = 1; i <= months; i++) {
      const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthName = forecastDate.toLocaleString('default', { month: 'long', year: 'numeric' });

      // Method 1: Exponential Smoothing
      const expSmoothing = this.exponentialSmoothing(amounts, 0.3);
      
      // Method 2: Moving Average
      const movingAvg = this.weightedMovingAverage(amounts, 3);
      
      // Method 3: Linear Regression with trend
      const linRegression = this.linearRegressionForecast(amounts, i);
      
      // Method 4: Seasonal adjustment (if enough data)
      const seasonal = amounts.length >= 12 
        ? this.seasonalForecast(amounts, forecastDate.getMonth())
        : null;

      // Ensemble prediction (weighted average of methods)
      const weights = seasonal ? [0.25, 0.25, 0.3, 0.2] : [0.35, 0.35, 0.3, 0];
      const prediction = (
        expSmoothing * weights[0] +
        movingAvg * weights[1] +
        linRegression * weights[2] +
        (seasonal || 0) * weights[3]
      );

      // Calculate confidence interval
      const stdDev = this.calculateStdDev(amounts);
      const confidence = this.calculateConfidence(amounts, stdDev);
      const marginOfError = stdDev * 1.96; // 95% confidence interval

      forecasts.push({
        month: monthName,
        monthIndex: forecastDate.getMonth() + 1,
        year: forecastDate.getFullYear(),
        predicted: Math.round(prediction * 100) / 100,
        lowEstimate: Math.round((prediction - marginOfError) * 100) / 100,
        highEstimate: Math.round((prediction + marginOfError) * 100) / 100,
        confidence: Math.round(confidence),
        methods: {
          exponentialSmoothing: Math.round(expSmoothing * 100) / 100,
          movingAverage: Math.round(movingAvg * 100) / 100,
          linearRegression: Math.round(linRegression * 100) / 100,
          seasonal: seasonal ? Math.round(seasonal * 100) / 100 : null
        }
      });
    }

    // Category-level forecasts
    const categoryForecasts = await this.forecastByCategory(userId, twelveMonthsAgo);

    const result = {
      success: true,
      forecasts,
      categoryForecasts,
      historicalAverage: Math.round(this.average(amounts) * 100) / 100,
      trend: this.detectTrend(amounts),
      dataPoints: amounts.length,
      generatedAt: new Date()
    };

    if (useCache) {
      await AnalyticsCache.setCache('ai_forecast', userId, { months }, result, 360); // 6 hours
    }

    return result;
  }

  /**
   * Forecast spending by category
   */
  async forecastByCategory(userId, startDate) {
    const categoryData = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate },
          type: 'expense'
        }
      },
      {
        $group: {
          _id: {
            category: '$category',
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          total: { $sum: '$amount' }
        }
      },
      {
        $group: {
          _id: '$_id.category',
          monthlyTotals: { $push: '$total' },
          avgMonthly: { $avg: '$total' },
          totalSpent: { $sum: '$total' },
          monthCount: { $sum: 1 }
        }
      }
    ]);

    return categoryData.map(cat => {
      const amounts = cat.monthlyTotals;
      const prediction = amounts.length >= 2 
        ? this.weightedMovingAverage(amounts, Math.min(3, amounts.length))
        : cat.avgMonthly;

      return {
        category: cat._id,
        predictedNextMonth: Math.round(prediction * 100) / 100,
        historicalAverage: Math.round(cat.avgMonthly * 100) / 100,
        trend: this.detectTrend(amounts),
        confidence: Math.min(90, 50 + cat.monthCount * 5)
      };
    });
  }

  // ==================== ANOMALY DETECTION ====================

  /**
   * Detect anomalous transactions using statistical methods
   */
  async detectAnomalies(userId, options = {}) {
    const { days = 90, sensitivity = 2, useCache = true } = options;

    if (useCache) {
      const cached = await AnalyticsCache.getCache('anomalies', userId, { days, sensitivity });
      if (cached) return cached;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all expenses with category context
    const expenses = await Expense.find({
      user: userId,
      type: 'expense',
      date: { $gte: startDate }
    }).sort({ date: -1 });

    if (expenses.length < 10) {
      return {
        anomalies: [],
        message: 'Need more transaction data for anomaly detection'
      };
    }

    // Calculate statistics by category
    const categoryStats = {};
    expenses.forEach(exp => {
      if (!categoryStats[exp.category]) {
        categoryStats[exp.category] = { amounts: [], transactions: [] };
      }
      categoryStats[exp.category].amounts.push(exp.amount);
      categoryStats[exp.category].transactions.push(exp);
    });

    // Calculate mean and std dev for each category
    Object.keys(categoryStats).forEach(cat => {
      const amounts = categoryStats[cat].amounts;
      categoryStats[cat].mean = this.average(amounts);
      categoryStats[cat].stdDev = this.calculateStdDev(amounts);
      categoryStats[cat].median = this.median(amounts);
      categoryStats[cat].iqr = this.interquartileRange(amounts);
    });

    // Detect anomalies using multiple methods
    const anomalies = [];
    const overallAmounts = expenses.map(e => e.amount);
    const overallMean = this.average(overallAmounts);
    const overallStdDev = this.calculateStdDev(overallAmounts);

    for (const expense of expenses.slice(0, 100)) { // Check recent 100
      const catStats = categoryStats[expense.category];
      const zScore = (expense.amount - catStats.mean) / (catStats.stdDev || 1);
      const overallZScore = (expense.amount - overallMean) / (overallStdDev || 1);
      
      // IQR method
      const iqrAnomaly = expense.amount > catStats.median + 1.5 * catStats.iqr;
      
      // Z-score method (category-specific)
      const zScoreAnomaly = Math.abs(zScore) > sensitivity;
      
      // Percentage deviation
      const percentDeviation = ((expense.amount - catStats.mean) / catStats.mean) * 100;

      if (zScoreAnomaly || iqrAnomaly) {
        anomalies.push({
          expense: {
            id: expense._id,
            description: expense.description,
            amount: expense.amount,
            category: expense.category,
            date: expense.date,
            merchant: expense.merchant
          },
          analysis: {
            categoryMean: Math.round(catStats.mean * 100) / 100,
            categoryStdDev: Math.round(catStats.stdDev * 100) / 100,
            zScore: Math.round(zScore * 100) / 100,
            overallZScore: Math.round(overallZScore * 100) / 100,
            percentDeviation: Math.round(percentDeviation * 10) / 10,
            isHigher: expense.amount > catStats.mean
          },
          severity: Math.abs(zScore) > 3 ? 'high' : Math.abs(zScore) > 2 ? 'medium' : 'low',
          reason: this.getAnomalyReason(expense, catStats, zScore)
        });
      }
    }

    // Sort by severity and z-score
    anomalies.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity] || 
             Math.abs(b.analysis.zScore) - Math.abs(a.analysis.zScore);
    });

    const result = {
      anomalies: anomalies.slice(0, 20),
      totalDetected: anomalies.length,
      summary: {
        highSeverity: anomalies.filter(a => a.severity === 'high').length,
        mediumSeverity: anomalies.filter(a => a.severity === 'medium').length,
        lowSeverity: anomalies.filter(a => a.severity === 'low').length
      },
      generatedAt: new Date()
    };

    if (useCache) {
      await AnalyticsCache.setCache('anomalies', userId, { days, sensitivity }, result, 120);
    }

    return result;
  }

  /**
   * Get human-readable anomaly reason
   */
  getAnomalyReason(expense, catStats, zScore) {
    const percentAbove = ((expense.amount - catStats.mean) / catStats.mean * 100).toFixed(0);
    
    if (zScore > 3) {
      return `Extremely high: ${percentAbove}% above your typical ${expense.category} spending`;
    } else if (zScore > 2) {
      return `Unusually high: ${percentAbove}% above your average for ${expense.category}`;
    } else if (zScore < -2) {
      return `Unusually low: ${Math.abs(percentAbove)}% below your average for ${expense.category}`;
    }
    return `Notable deviation from your ${expense.category} spending pattern`;
  }

  // ==================== FINANCIAL HEALTH SCORE ====================

  /**
   * Calculate comprehensive financial health score (0-100)
   */
  async calculateHealthScore(userId, options = {}) {
    const { useCache = true } = options;

    if (useCache) {
      const cached = await AnalyticsCache.getCache('health_score', userId, {});
      if (cached) return cached;
    }

    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    // Get financial data
    const [recentData, budgets, goals] = await Promise.all([
      Expense.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            date: { $gte: threeMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              type: '$type',
              month: { $month: '$date' }
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),
      Budget.find({ user: userId, isActive: true }),
      Goal.find({ user: userId, status: 'active' })
    ]);

    // Calculate individual factors
    const factors = [];

    // 1. Savings Rate Factor (30% weight)
    const monthlyIncome = {};
    const monthlyExpense = {};
    recentData.forEach(d => {
      if (d._id.type === 'income') {
        monthlyIncome[d._id.month] = (monthlyIncome[d._id.month] || 0) + d.total;
      } else {
        monthlyExpense[d._id.month] = (monthlyExpense[d._id.month] || 0) + d.total;
      }
    });

    const totalIncome = Object.values(monthlyIncome).reduce((a, b) => a + b, 0);
    const totalExpense = Object.values(monthlyExpense).reduce((a, b) => a + b, 0);
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
    
    let savingsScore;
    if (savingsRate >= 30) savingsScore = 100;
    else if (savingsRate >= 20) savingsScore = 85;
    else if (savingsRate >= 10) savingsScore = 70;
    else if (savingsRate >= 0) savingsScore = 50;
    else savingsScore = Math.max(0, 50 + savingsRate); // Negative savings

    factors.push({
      name: 'Savings Rate',
      score: Math.round(savingsScore),
      weight: 0.30,
      status: savingsScore >= 70 ? 'good' : savingsScore >= 50 ? 'moderate' : 'needs_improvement',
      value: `${savingsRate.toFixed(1)}%`,
      description: `You're saving ${savingsRate.toFixed(1)}% of your income`
    });

    // 2. Budget Adherence Factor (25% weight)
    let budgetScore = 75; // Default if no budgets
    if (budgets.length > 0) {
      const budgetResults = await Promise.all(budgets.map(async budget => {
        const spent = await this.getCategorySpending(userId, budget.category, threeMonthsAgo);
        const monthlyBudget = budget.amount;
        const avgMonthlySpent = spent / 3;
        return avgMonthlySpent <= monthlyBudget ? 1 : monthlyBudget / avgMonthlySpent;
      }));
      budgetScore = Math.round((budgetResults.reduce((a, b) => a + b, 0) / budgetResults.length) * 100);
    }

    factors.push({
      name: 'Budget Adherence',
      score: Math.round(budgetScore),
      weight: 0.25,
      status: budgetScore >= 80 ? 'good' : budgetScore >= 60 ? 'moderate' : 'needs_improvement',
      value: `${budgetScore}%`,
      description: budgets.length > 0 
        ? `Sticking to ${budgetScore}% of your budgets` 
        : 'Set budgets to improve this score'
    });

    // 3. Spending Consistency Factor (15% weight)
    const monthlyExpenses = Object.values(monthlyExpense);
    const expenseVariance = monthlyExpenses.length > 1 
      ? this.calculateStdDev(monthlyExpenses) / (this.average(monthlyExpenses) || 1)
      : 0;
    const consistencyScore = Math.max(0, 100 - (expenseVariance * 100));

    factors.push({
      name: 'Spending Consistency',
      score: Math.round(consistencyScore),
      weight: 0.15,
      status: consistencyScore >= 70 ? 'good' : consistencyScore >= 50 ? 'moderate' : 'needs_improvement',
      value: `${(100 - expenseVariance * 100).toFixed(0)}%`,
      description: consistencyScore >= 70 
        ? 'Your spending is consistent month-to-month'
        : 'Your spending varies significantly between months'
    });

    // 4. Expense Tracking Factor (10% weight)
    const transactionCount = recentData.reduce((sum, d) => sum + d.count, 0);
    const daysInPeriod = Math.ceil((now - threeMonthsAgo) / (1000 * 60 * 60 * 24));
    const avgDailyTransactions = transactionCount / daysInPeriod;
    const trackingScore = Math.min(100, avgDailyTransactions * 50); // 2+ transactions/day = 100

    factors.push({
      name: 'Expense Tracking',
      score: Math.round(trackingScore),
      weight: 0.10,
      status: trackingScore >= 70 ? 'good' : trackingScore >= 40 ? 'moderate' : 'needs_improvement',
      value: `${transactionCount} transactions`,
      description: trackingScore >= 70 
        ? 'Great job tracking your expenses!'
        : 'Track more expenses for better insights'
    });

    // 5. Goal Progress Factor (10% weight)
    let goalScore = 50; // Default if no goals
    if (goals.length > 0) {
      const avgProgress = goals.reduce((sum, g) => {
        const progress = (g.currentAmount / g.targetAmount) * 100;
        const timeProgress = ((now - g.createdAt) / (g.targetDate - g.createdAt)) * 100;
        return sum + (progress >= timeProgress ? 100 : (progress / timeProgress) * 100);
      }, 0) / goals.length;
      goalScore = Math.min(100, avgProgress);
    }

    factors.push({
      name: 'Goal Progress',
      score: Math.round(goalScore),
      weight: 0.10,
      status: goalScore >= 70 ? 'good' : goalScore >= 50 ? 'moderate' : 'needs_improvement',
      value: `${goals.length} active goals`,
      description: goals.length > 0 
        ? `On track with ${Math.round(goalScore)}% of your goals`
        : 'Set financial goals to improve this score'
    });

    // 6. Diversification Factor (10% weight)
    const categoryData = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: threeMonthsAgo },
          type: 'expense'
        }
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' }
        }
      }
    ]);

    const categoryTotals = categoryData.map(c => c.total);
    const totalCategorySpend = categoryTotals.reduce((a, b) => a + b, 0);
    const maxCategoryPercent = totalCategorySpend > 0 
      ? (Math.max(...categoryTotals) / totalCategorySpend) * 100 
      : 0;
    const diversificationScore = maxCategoryPercent > 0 
      ? Math.max(0, 100 - (maxCategoryPercent - 30)) // Ideal: no category > 30%
      : 50;

    factors.push({
      name: 'Spending Diversification',
      score: Math.round(diversificationScore),
      weight: 0.10,
      status: diversificationScore >= 70 ? 'good' : diversificationScore >= 50 ? 'moderate' : 'needs_improvement',
      value: `${categoryData.length} categories`,
      description: diversificationScore >= 70 
        ? 'Well-balanced spending across categories'
        : 'One category dominates your spending'
    });

    // Calculate overall score
    const overallScore = factors.reduce((sum, f) => sum + (f.score * f.weight), 0);

    // Get previous score for comparison
    const previousInsight = await FinancialInsight.findOne({
      user: userId,
      type: 'health_score'
    }).sort({ createdAt: -1 });
    const previousScore = previousInsight?.data?.score;

    // Determine health status
    let healthStatus;
    if (overallScore >= 80) healthStatus = 'excellent';
    else if (overallScore >= 65) healthStatus = 'good';
    else if (overallScore >= 50) healthStatus = 'fair';
    else if (overallScore >= 35) healthStatus = 'needs_attention';
    else healthStatus = 'critical';

    const result = {
      score: Math.round(overallScore),
      previousScore: previousScore || null,
      change: previousScore ? Math.round(overallScore - previousScore) : null,
      status: healthStatus,
      factors,
      recommendations: this.getHealthRecommendations(factors),
      generatedAt: new Date()
    };

    // Store as insight
    await this.storeInsight(userId, {
      type: 'health_score',
      title: 'Financial Health Score Updated',
      message: `Your financial health score is ${Math.round(overallScore)}/100 (${healthStatus})`,
      priority: 2,
      severity: healthStatus === 'excellent' || healthStatus === 'good' ? 'success' : 
                healthStatus === 'fair' ? 'info' : 'warning',
      data: { score: Math.round(overallScore), previousScore, factors }
    });

    if (useCache) {
      await AnalyticsCache.setCache('health_score', userId, {}, result, 1440); // 24 hours
    }

    return result;
  }

  /**
   * Get recommendations based on health factors
   */
  getHealthRecommendations(factors) {
    const recommendations = [];

    factors.forEach(factor => {
      if (factor.status === 'needs_improvement') {
        switch (factor.name) {
          case 'Savings Rate':
            recommendations.push({
              title: 'Increase Your Savings',
              description: 'Try to save at least 20% of your income. Start with small increases.',
              priority: 1
            });
            break;
          case 'Budget Adherence':
            recommendations.push({
              title: 'Review Your Budgets',
              description: 'Adjust budgets to be more realistic or cut back in overspent categories.',
              priority: 2
            });
            break;
          case 'Spending Consistency':
            recommendations.push({
              title: 'Stabilize Your Spending',
              description: 'Create a monthly spending plan to avoid large fluctuations.',
              priority: 3
            });
            break;
          case 'Expense Tracking':
            recommendations.push({
              title: 'Track More Expenses',
              description: 'Log all your expenses for better financial insights.',
              priority: 4
            });
            break;
          case 'Goal Progress':
            recommendations.push({
              title: 'Focus on Your Goals',
              description: 'Review your goals and set up automatic savings if possible.',
              priority: 2
            });
            break;
          case 'Spending Diversification':
            recommendations.push({
              title: 'Balance Your Spending',
              description: 'Consider if you\'re overspending in any single category.',
              priority: 3
            });
            break;
        }
      }
    });

    return recommendations.sort((a, b) => a.priority - b.priority);
  }

  // ==================== SMART RECOMMENDATIONS ====================

  /**
   * Generate AI-powered savings recommendations
   */
  async generateRecommendations(userId, options = {}) {
    const { useCache = true } = options;

    if (useCache) {
      const cached = await AnalyticsCache.getCache('recommendations', userId, {});
      if (cached) return cached;
    }

    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    // Get spending data
    const [categorySpending, merchantSpending, timePatterns] = await Promise.all([
      this.getCategoryAnalysis(userId, threeMonthsAgo),
      this.getMerchantAnalysis(userId, threeMonthsAgo),
      this.getTimePatterns(userId, threeMonthsAgo)
    ]);

    const recommendations = [];

    // 1. Category-based recommendations
    categorySpending.forEach(cat => {
      if (cat.percentOfTotal > 35) {
        recommendations.push({
          type: 'category_reduction',
          title: `Reduce ${this.capitalizeFirst(cat.category)} Spending`,
          description: `${this.capitalizeFirst(cat.category)} accounts for ${cat.percentOfTotal.toFixed(0)}% of your spending. Consider setting a stricter budget.`,
          potentialSavings: Math.round(cat.total * 0.15),
          priority: 1,
          actionItems: [
            `Set a monthly budget of ₹${Math.round(cat.total * 0.85 / 3)} for ${cat.category}`,
            `Look for alternatives or deals in this category`,
            `Track every ${cat.category} expense for awareness`
          ]
        });
      }
    });

    // 2. Merchant-based recommendations
    const topMerchants = merchantSpending.slice(0, 5);
    topMerchants.forEach(merchant => {
      if (merchant.frequency >= 10 && merchant.avgAmount > 100) {
        recommendations.push({
          type: 'merchant_optimization',
          title: `Optimize ${merchant.name} Spending`,
          description: `You visited ${merchant.name} ${merchant.frequency} times, spending ₹${merchant.total.toFixed(0)} total.`,
          potentialSavings: Math.round(merchant.total * 0.10),
          priority: 2,
          actionItems: [
            'Look for subscription or loyalty discounts',
            'Consider bulk purchases or alternatives',
            `Reduce visits by ${Math.round(merchant.frequency * 0.2)} per month`
          ]
        });
      }
    });

    // 3. Time-based recommendations
    if (timePatterns.weekendSpendingRatio > 1.5) {
      recommendations.push({
        type: 'timing',
        title: 'Reduce Weekend Spending',
        description: `You spend ${((timePatterns.weekendSpendingRatio - 1) * 100).toFixed(0)}% more on weekends. Plan weekend activities in advance.`,
        potentialSavings: Math.round(timePatterns.weekendTotal * 0.20),
        priority: 2,
        actionItems: [
          'Plan free or low-cost weekend activities',
          'Set a weekend spending limit',
          'Prepare meals at home for weekends'
        ]
      });
    }

    // 4. Small purchase recommendations
    const smallPurchases = await this.getSmallPurchaseAnalysis(userId, threeMonthsAgo);
    if (smallPurchases.total > 5000) {
      recommendations.push({
        type: 'small_purchases',
        title: 'Watch Small Purchases',
        description: `${smallPurchases.count} purchases under ₹100 totaled ₹${smallPurchases.total.toFixed(0)}. Small amounts add up!`,
        potentialSavings: Math.round(smallPurchases.total * 0.30),
        priority: 3,
        actionItems: [
          'Set a daily limit for small purchases',
          'Wait 24 hours before impulse buys',
          'Track all small expenses'
        ]
      });
    }

    // 5. Subscription audit recommendation
    recommendations.push({
      type: 'subscription_audit',
      title: 'Review Subscriptions',
      description: 'Regular subscription audits can save 10-20% on recurring costs.',
      potentialSavings: null,
      priority: 4,
      actionItems: [
        'List all active subscriptions',
        'Cancel unused services',
        'Look for family or annual plans'
      ]
    });

    // Sort by potential savings
    recommendations.sort((a, b) => (b.potentialSavings || 0) - (a.potentialSavings || 0));

    const totalPotentialSavings = recommendations
      .reduce((sum, r) => sum + (r.potentialSavings || 0), 0);

    const result = {
      recommendations: recommendations.slice(0, 10),
      totalPotentialSavings,
      personalizedTips: this.getPersonalizedTips(categorySpending),
      generatedAt: new Date()
    };

    if (useCache) {
      await AnalyticsCache.setCache('recommendations', userId, {}, result, 360);
    }

    return result;
  }

  // ==================== TREND ANALYSIS ====================

  /**
   * Analyze spending trends and seasonal patterns
   */
  async analyzeTrends(userId, options = {}) {
    const { useCache = true } = options;

    if (useCache) {
      const cached = await AnalyticsCache.getCache('trend_analysis', userId, {});
      if (cached) return cached;
    }

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    // Monthly aggregation
    const monthlyData = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: twelveMonthsAgo },
          type: 'expense'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const amounts = monthlyData.map(m => m.total);

    // Overall trend
    const overallTrend = this.detectTrend(amounts);
    const trendSlope = this.linearRegressionSlope(amounts);
    const monthlyChange = amounts.length >= 2 
      ? ((amounts[amounts.length - 1] - amounts[0]) / amounts[0]) * 100 
      : 0;

    // Seasonal patterns
    const seasonalAnalysis = this.analyzeSeasonality(monthlyData);

    // Category trends
    const categoryTrends = await this.getCategoryTrends(userId, twelveMonthsAgo);

    // Week-over-week volatility
    const volatility = this.calculateVolatility(amounts);

    const result = {
      overallTrend: {
        direction: overallTrend,
        monthlyChangePercent: Math.round(trendSlope / (this.average(amounts) || 1) * 100 * 10) / 10,
        totalChangePercent: Math.round(monthlyChange * 10) / 10,
        interpretation: this.interpretTrend(overallTrend, monthlyChange)
      },
      seasonalPatterns: seasonalAnalysis,
      categoryTrends,
      volatility: {
        level: volatility > 0.3 ? 'high' : volatility > 0.15 ? 'moderate' : 'low',
        coefficient: Math.round(volatility * 100) / 100,
        interpretation: volatility > 0.3 
          ? 'Your spending varies significantly month-to-month'
          : 'Your spending is relatively stable'
      },
      insights: this.generateTrendInsights(overallTrend, seasonalAnalysis, categoryTrends),
      generatedAt: new Date()
    };

    if (useCache) {
      await AnalyticsCache.setCache('trend_analysis', userId, {}, result, 360);
    }

    return result;
  }

  /**
   * Analyze seasonality in spending
   */
  analyzeSeasonality(monthlyData) {
    const monthAverages = {};
    
    monthlyData.forEach(m => {
      const month = m._id.month;
      if (!monthAverages[month]) {
        monthAverages[month] = { total: 0, count: 0 };
      }
      monthAverages[month].total += m.total;
      monthAverages[month].count++;
    });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const patterns = Object.entries(monthAverages).map(([month, data]) => ({
      month: monthNames[parseInt(month) - 1],
      monthNumber: parseInt(month),
      average: Math.round(data.total / data.count)
    }));

    const overallAvg = patterns.reduce((sum, p) => sum + p.average, 0) / patterns.length;

    patterns.forEach(p => {
      p.indexVsAverage = Math.round((p.average / overallAvg - 1) * 100);
      p.isHighSpend = p.indexVsAverage > 15;
      p.isLowSpend = p.indexVsAverage < -15;
    });

    const highSpendMonths = patterns.filter(p => p.isHighSpend);
    const lowSpendMonths = patterns.filter(p => p.isLowSpend);

    return {
      patterns: patterns.sort((a, b) => a.monthNumber - b.monthNumber),
      highSpendMonths: highSpendMonths.map(m => m.month),
      lowSpendMonths: lowSpendMonths.map(m => m.month),
      insight: highSpendMonths.length > 0 
        ? `Spending tends to peak in ${highSpendMonths.map(m => m.month).join(', ')}`
        : 'No strong seasonal patterns detected'
    };
  }

  // ==================== BUDGET OPTIMIZATION ====================

  /**
   * Suggest optimal budget allocations based on spending patterns
   */
  async optimizeBudgets(userId, options = {}) {
    const { targetSavingsRate = 20, useCache = true } = options;

    if (useCache) {
      const cached = await AnalyticsCache.getCache('budget_optimization', userId, { targetSavingsRate });
      if (cached) return cached;
    }

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Get current spending and income
    const financialData = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: threeMonthsAgo }
        }
      },
      {
        $group: {
          _id: { type: '$type', category: '$category' },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const income = financialData
      .filter(d => d._id.type === 'income')
      .reduce((sum, d) => sum + d.total, 0) / 3;

    const categorySpending = {};
    financialData
      .filter(d => d._id.type === 'expense')
      .forEach(d => {
        categorySpending[d._id.category] = (d.total / 3);
      });

    const totalMonthlyExpense = Object.values(categorySpending).reduce((a, b) => a + b, 0);
    const currentSavingsRate = income > 0 ? ((income - totalMonthlyExpense) / income) * 100 : 0;

    // Calculate optimal budgets using the 50/30/20 rule as baseline
    const targetExpense = income * (1 - targetSavingsRate / 100);
    const reductionNeeded = Math.max(0, totalMonthlyExpense - targetExpense);

    // Categorize spending
    const essentialCategories = ['utilities', 'healthcare', 'transport'];
    const discretionaryCategories = ['entertainment', 'shopping', 'food'];

    const suggestions = [];
    const currentBudgets = await Budget.find({ user: userId, isActive: true });
    const budgetMap = {};
    currentBudgets.forEach(b => { budgetMap[b.category] = b.amount; });

    Object.entries(categorySpending).forEach(([category, amount]) => {
      const isEssential = essentialCategories.includes(category);
      const currentBudget = budgetMap[category];
      
      // Calculate suggested budget
      let suggestedBudget;
      if (reductionNeeded > 0) {
        const reductionRate = isEssential ? 0.05 : 0.15;
        suggestedBudget = Math.round(amount * (1 - reductionRate));
      } else {
        suggestedBudget = Math.round(amount * 1.05); // Small buffer
      }

      suggestions.push({
        category,
        currentSpending: Math.round(amount),
        currentBudget: currentBudget || null,
        suggestedBudget,
        change: currentBudget ? suggestedBudget - currentBudget : null,
        changePercent: currentBudget 
          ? Math.round((suggestedBudget - currentBudget) / currentBudget * 100)
          : null,
        isEssential,
        reason: this.getBudgetReason(category, amount, suggestedBudget, isEssential)
      });
    });

    // Sort by potential savings
    suggestions.sort((a, b) => (a.currentSpending - a.suggestedBudget) - (b.currentSpending - b.suggestedBudget));

    const result = {
      monthlyIncome: Math.round(income),
      currentMonthlyExpense: Math.round(totalMonthlyExpense),
      currentSavingsRate: Math.round(currentSavingsRate),
      targetSavingsRate,
      targetMonthlyExpense: Math.round(targetExpense),
      reductionNeeded: Math.round(reductionNeeded),
      suggestions,
      recommendedAllocation: {
        needs: Math.round(income * 0.50),
        wants: Math.round(income * 0.30),
        savings: Math.round(income * 0.20)
      },
      generatedAt: new Date()
    };

    if (useCache) {
      await AnalyticsCache.setCache('budget_optimization', userId, { targetSavingsRate }, result, 720);
    }

    return result;
  }

  /**
   * Get reason for budget suggestion
   */
  getBudgetReason(category, current, suggested, isEssential) {
    const change = suggested - current;
    if (change < 0) {
      return isEssential
        ? `${this.capitalizeFirst(category)} is essential but can be optimized slightly`
        : `Consider reducing discretionary ${category} spending`;
    }
    return `Budget includes a buffer for ${category} expenses`;
  }

  // ==================== HELPER METHODS ====================

  async getCategorySpending(userId, category, startDate) {
    const result = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          category,
          type: 'expense',
          date: { $gte: startDate }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    return result[0]?.total || 0;
  }

  async getCategoryAnalysis(userId, startDate) {
    const data = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          type: 'expense',
          date: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          avg: { $avg: '$amount' }
        }
      },
      { $sort: { total: -1 } }
    ]);

    const grandTotal = data.reduce((sum, d) => sum + d.total, 0);
    return data.map(d => ({
      category: d._id,
      total: d.total,
      count: d.count,
      average: d.avg,
      percentOfTotal: (d.total / grandTotal) * 100
    }));
  }

  async getMerchantAnalysis(userId, startDate) {
    const data = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          type: 'expense',
          date: { $gte: startDate },
          merchant: { $ne: '', $exists: true }
        }
      },
      {
        $group: {
          _id: '$merchant',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 20 }
    ]);

    return data.map(d => ({
      name: d._id,
      total: d.total,
      frequency: d.count,
      avgAmount: d.avgAmount
    }));
  }

  async getTimePatterns(userId, startDate) {
    const data = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          type: 'expense',
          date: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dayOfWeek: '$date' },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const weekdayTotal = data.filter(d => d._id >= 2 && d._id <= 6).reduce((sum, d) => sum + d.total, 0);
    const weekendTotal = data.filter(d => d._id === 1 || d._id === 7).reduce((sum, d) => sum + d.total, 0);
    const weekdayDays = 5;
    const weekendDays = 2;

    return {
      weekdayAvgDaily: weekdayTotal / weekdayDays / 13, // ~13 weeks in 3 months
      weekendAvgDaily: weekendTotal / weekendDays / 13,
      weekendTotal,
      weekendSpendingRatio: (weekendTotal / weekendDays) / (weekdayTotal / weekdayDays) || 1
    };
  }

  async getSmallPurchaseAnalysis(userId, startDate) {
    const data = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          type: 'expense',
          date: { $gte: startDate },
          amount: { $lt: 100 }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    return data[0] || { total: 0, count: 0 };
  }

  async getCategoryTrends(userId, startDate) {
    const data = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          type: 'expense',
          date: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            category: '$category',
            month: { $month: '$date' }
          },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.month': 1 } }
    ]);

    const categoryData = {};
    data.forEach(d => {
      if (!categoryData[d._id.category]) {
        categoryData[d._id.category] = [];
      }
      categoryData[d._id.category].push(d.total);
    });

    return Object.entries(categoryData).map(([category, amounts]) => ({
      category,
      trend: this.detectTrend(amounts),
      changePercent: amounts.length >= 2 
        ? Math.round((amounts[amounts.length - 1] - amounts[0]) / amounts[0] * 100)
        : 0
    }));
  }

  getPersonalizedTips(categorySpending) {
    const tips = [];
    
    categorySpending.forEach(cat => {
      switch (cat.category) {
        case 'food':
          if (cat.percentOfTotal > 25) {
            tips.push('Consider meal prepping on weekends to reduce food costs');
          }
          break;
        case 'entertainment':
          if (cat.percentOfTotal > 15) {
            tips.push('Look for free entertainment options like parks or community events');
          }
          break;
        case 'shopping':
          if (cat.percentOfTotal > 20) {
            tips.push('Implement a 48-hour rule before non-essential purchases');
          }
          break;
        case 'transport':
          if (cat.percentOfTotal > 15) {
            tips.push('Consider carpooling or public transport options');
          }
          break;
      }
    });

    return tips;
  }

  generateTrendInsights(overallTrend, seasonalAnalysis, categoryTrends) {
    const insights = [];

    if (overallTrend === 'increasing') {
      insights.push({
        type: 'warning',
        message: 'Your overall spending is trending upward. Review recent expenses.'
      });
    } else if (overallTrend === 'decreasing') {
      insights.push({
        type: 'success',
        message: 'Great job! Your spending is trending downward.'
      });
    }

    if (seasonalAnalysis.highSpendMonths.length > 0) {
      insights.push({
        type: 'info',
        message: `Plan ahead for ${seasonalAnalysis.highSpendMonths.join(', ')} - typically high-spend months.`
      });
    }

    const increasingCategories = categoryTrends.filter(c => c.trend === 'increasing' && c.changePercent > 20);
    if (increasingCategories.length > 0) {
      insights.push({
        type: 'warning',
        message: `Watch spending in ${increasingCategories.map(c => c.category).join(', ')} - rising trends detected.`
      });
    }

    return insights;
  }

  interpretTrend(direction, changePercent) {
    const absChange = Math.abs(changePercent);
    if (direction === 'stable') return 'Your spending has been stable';
    if (direction === 'increasing') {
      if (absChange > 30) return 'Significant spending increase detected';
      if (absChange > 15) return 'Moderate spending increase';
      return 'Slight spending increase';
    }
    if (absChange > 30) return 'Significant spending reduction - well done!';
    if (absChange > 15) return 'Good progress in reducing spending';
    return 'Slight spending decrease';
  }

  // ==================== STATISTICAL HELPERS ====================

  exponentialSmoothing(data, alpha) {
    if (data.length === 0) return 0;
    let smoothed = data[0];
    for (let i = 1; i < data.length; i++) {
      smoothed = alpha * data[i] + (1 - alpha) * smoothed;
    }
    return smoothed;
  }

  weightedMovingAverage(data, period) {
    if (data.length === 0) return 0;
    const n = Math.min(period, data.length);
    const recent = data.slice(-n);
    let weightSum = 0;
    let weightedSum = 0;
    for (let i = 0; i < recent.length; i++) {
      const weight = i + 1;
      weightedSum += recent[i] * weight;
      weightSum += weight;
    }
    return weightedSum / weightSum;
  }

  linearRegressionForecast(data, periodsAhead) {
    const slope = this.linearRegressionSlope(data);
    const lastValue = data[data.length - 1] || 0;
    return lastValue + slope * periodsAhead;
  }

  linearRegressionSlope(data) {
    if (data.length < 2) return 0;
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumXX += i * i;
    }
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;
  }

  seasonalForecast(data, targetMonth) {
    // Simple seasonal index calculation
    if (data.length < 12) return null;
    const monthlyAvg = this.average(data);
    const sameMonthValues = data.filter((_, i) => i % 12 === targetMonth);
    if (sameMonthValues.length === 0) return monthlyAvg;
    const seasonalIndex = this.average(sameMonthValues) / monthlyAvg;
    return this.average(data.slice(-3)) * seasonalIndex;
  }

  calculateStdDev(data) {
    if (data.length < 2) return 0;
    const mean = this.average(data);
    const squaredDiffs = data.map(x => Math.pow(x - mean, 2));
    return Math.sqrt(this.average(squaredDiffs));
  }

  calculateConfidence(data, stdDev) {
    if (data.length < 3) return 30;
    const cv = stdDev / (this.average(data) || 1);
    const dataPointsFactor = Math.min(30, data.length * 2.5);
    const variabilityFactor = Math.max(0, 70 - cv * 100);
    return Math.min(95, dataPointsFactor + variabilityFactor);
  }

  calculateVolatility(data) {
    if (data.length < 2) return 0;
    return this.calculateStdDev(data) / (this.average(data) || 1);
  }

  average(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  interquartileRange(arr) {
    if (arr.length < 4) return this.calculateStdDev(arr) * 1.35;
    const sorted = [...arr].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    return q3 - q1;
  }

  detectTrend(data) {
    if (data.length < 3) return 'stable';
    const slope = this.linearRegressionSlope(data);
    const avg = this.average(data);
    const relativeSlope = slope / (avg || 1);
    if (relativeSlope > 0.05) return 'increasing';
    if (relativeSlope < -0.05) return 'decreasing';
    return 'stable';
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ==================== INSIGHT STORAGE ====================

  async storeInsight(userId, insightData) {
    // Generate hash to prevent duplicates
    const hashInput = `${userId}-${insightData.type}-${insightData.title}-${new Date().toDateString()}`;
    const insightHash = crypto.createHash('md5').update(hashInput).digest('hex');

    // Check for existing similar insight today
    const existing = await FinancialInsight.findOne({ insightHash });
    if (existing) return existing;

    const insight = new FinancialInsight({
      user: userId,
      ...insightData,
      insightHash,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    await insight.save();

    // Send notification for high-priority insights
    if (insightData.priority <= 2) {
      await notificationService.sendNotification(userId, {
        title: insightData.title,
        message: insightData.message,
        type: 'financial_insight',
        priority: insightData.severity === 'critical' ? 'high' : 'medium',
        data: { insightId: insight._id }
      });
    }

    return insight;
  }

  /**
   * Get comprehensive financial dashboard
   */
  async getComprehensiveDashboard(userId) {
    const [forecast, anomalies, healthScore, recommendations, trends] = await Promise.all([
      this.generateForecast(userId, { months: 3 }),
      this.detectAnomalies(userId, { days: 30 }),
      this.calculateHealthScore(userId),
      this.generateRecommendations(userId),
      this.analyzeTrends(userId)
    ]);

    return {
      healthScore: {
        score: healthScore.score,
        status: healthScore.status,
        change: healthScore.change
      },
      forecast: forecast.forecasts?.[0] || null,
      anomalies: {
        count: anomalies.totalDetected,
        highPriority: anomalies.summary?.highSeverity || 0
      },
      topRecommendation: recommendations.recommendations?.[0] || null,
      trend: trends.overallTrend,
      generatedAt: new Date()
    };
  }
}

module.exports = new AIInsightsService();
