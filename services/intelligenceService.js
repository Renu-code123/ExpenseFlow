const Expense = require('../models/Expense');
const Budget = require('../models/Budget');
const User = require('../models/User');

/**
 * Intelligence Service
 * Provides predictive analytics, burn rate calculations, and AI-driven financial forecasting
 */
class IntelligenceService {
  /**
   * Calculate daily spending velocity (burn rate) for a user
   * @param {String} userId - User ID
   * @param {Object} options - Options (startDate, endDate, categoryId)
   * @returns {Object} Velocity metrics
   */
  async calculateBurnRate(userId, options = {}) {
    const { startDate, endDate, categoryId, workspaceId } = options;
    
    const query = { user: userId };
    if (categoryId) query.category = categoryId;
    if (workspaceId) query.workspace = workspaceId;
    
    // Default to last 30 days if no date range provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    query.date = { $gte: start, $lte: end };
    
    const expenses = await Expense.find(query).sort({ date: 1 });
    
    if (expenses.length === 0) {
      return {
        dailyBurnRate: 0,
        weeklyBurnRate: 0,
        totalSpent: 0,
        daysAnalyzed: 0,
        trend: 'stable',
        confidence: 0
      };
    }
    
    const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const daysAnalyzed = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    const dailyBurnRate = totalSpent / daysAnalyzed;
    const weeklyBurnRate = dailyBurnRate * 7;
    
    // Calculate trend (comparing first half vs second half)
    const midpoint = new Date((start.getTime() + end.getTime()) / 2);
    const firstHalf = expenses.filter(e => new Date(e.date) < midpoint);
    const secondHalf = expenses.filter(e => new Date(e.date) >= midpoint);
    
    const firstHalfAvg = firstHalf.length > 0 
      ? firstHalf.reduce((sum, e) => sum + e.amount, 0) / firstHalf.length 
      : 0;
    const secondHalfAvg = secondHalf.length > 0 
      ? secondHalf.reduce((sum, e) => sum + e.amount, 0) / secondHalf.length 
      : 0;
    
    let trend = 'stable';
    const changePct = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;
    
    if (changePct > 10) trend = 'increasing';
    else if (changePct < -10) trend = 'decreasing';
    
    // Confidence based on data points
    const confidence = Math.min(100, (expenses.length / 30) * 100);
    
    return {
      dailyBurnRate: parseFloat(dailyBurnRate.toFixed(2)),
      weeklyBurnRate: parseFloat(weeklyBurnRate.toFixed(2)),
      totalSpent: parseFloat(totalSpent.toFixed(2)),
      daysAnalyzed,
      trend,
      trendPercentage: parseFloat(changePct.toFixed(2)),
      confidence: parseFloat(confidence.toFixed(2)),
      dataPoints: expenses.length
    };
  }
  
  /**
   * Predict future expenses using linear regression
   * @param {String} userId - User ID
   * @param {Object} options - Options (categoryId, daysToPredict, workspaceId)
   * @returns {Object} Prediction data
   */
  async predictExpenses(userId, options = {}) {
    const { categoryId, daysToPredict = 30, workspaceId } = options;
    
    // Get historical data (last 90 days)
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    const query = { 
      user: userId,
      date: { $gte: startDate, $lte: endDate }
    };
    
    if (categoryId) query.category = categoryId;
    if (workspaceId) query.workspace = workspaceId;
    
    const expenses = await Expense.find(query).sort({ date: 1 });
    
    if (expenses.length < 7) {
      return {
        success: false,
        message: 'Insufficient data for prediction (minimum 7 days required)',
        predictions: []
      };
    }
    
    // Group expenses by day
    const dailyTotals = this._groupExpensesByDay(expenses, startDate, endDate);
    
    // Apply linear regression
    const { slope, intercept, rSquared } = this._linearRegression(dailyTotals);
    
    // Generate predictions
    const predictions = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 1; i <= daysToPredict; i++) {
      const futureDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      const dayIndex = dailyTotals.length + i;
      const predictedAmount = Math.max(0, slope * dayIndex + intercept);
      
      predictions.push({
        date: futureDate.toISOString().split('T')[0],
        predictedAmount: parseFloat(predictedAmount.toFixed(2)),
        confidence: parseFloat((rSquared * 100).toFixed(2))
      });
    }
    
    // Calculate cumulative prediction
    const cumulativePredictions = [];
    let cumulative = 0;
    
    for (const pred of predictions) {
      cumulative += pred.predictedAmount;
      cumulativePredictions.push({
        date: pred.date,
        cumulativeAmount: parseFloat(cumulative.toFixed(2)),
        confidence: pred.confidence
      });
    }
    
    return {
      success: true,
      predictions,
      cumulativePredictions,
      model: {
        slope: parseFloat(slope.toFixed(4)),
        intercept: parseFloat(intercept.toFixed(2)),
        rSquared: parseFloat(rSquared.toFixed(4)),
        accuracy: parseFloat((rSquared * 100).toFixed(2))
      },
      historicalData: dailyTotals.slice(-30), // Last 30 days
      dataPoints: expenses.length
    };
  }
  
  /**
   * Calculate weighted moving average for smoother predictions
   * @param {String} userId - User ID
   * @param {Object} options - Options (categoryId, period, workspaceId)
   * @returns {Object} WMA data
   */
  async calculateWeightedMovingAverage(userId, options = {}) {
    const { categoryId, period = 7, workspaceId } = options;
    
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - period * 2 * 24 * 60 * 60 * 1000);
    
    const query = { 
      user: userId,
      date: { $gte: startDate, $lte: endDate }
    };
    
    if (categoryId) query.category = categoryId;
    if (workspaceId) query.workspace = workspaceId;
    
    const expenses = await Expense.find(query).sort({ date: 1 });
    const dailyTotals = this._groupExpensesByDay(expenses, startDate, endDate);
    
    if (dailyTotals.length < period) {
      return {
        success: false,
        message: `Insufficient data for ${period}-day WMA`,
        wma: []
      };
    }
    
    const wmaValues = [];
    
    for (let i = period - 1; i < dailyTotals.length; i++) {
      const slice = dailyTotals.slice(i - period + 1, i + 1);
      const wma = this._calculateWMA(slice, period);
      
      wmaValues.push({
        date: slice[slice.length - 1].date,
        wma: parseFloat(wma.toFixed(2)),
        actual: slice[slice.length - 1].amount
      });
    }
    
    return {
      success: true,
      wma: wmaValues,
      period,
      currentWMA: wmaValues[wmaValues.length - 1]?.wma || 0
    };
  }
  
  /**
   * Predict when user will hit budget limit
   * @param {String} userId - User ID
   * @param {String} budgetId - Budget ID
   * @returns {Object} Budget exhaustion prediction
   */
  async predictBudgetExhaustion(userId, budgetId) {
    const budget = await Budget.findOne({ _id: budgetId, user: userId })
      .populate('category');
    
    if (!budget) {
      throw new Error('Budget not found');
    }
    
    const currentDate = new Date();
    const periodStart = new Date(budget.period.start);
    const periodEnd = new Date(budget.period.end);
    
    if (currentDate > periodEnd) {
      return {
        status: 'expired',
        message: 'Budget period has ended',
        daysRemaining: 0
      };
    }
    
    // Get current spending
    const spent = await this._calculateBudgetSpending(userId, budget, periodStart, currentDate);
    const remaining = budget.amount - spent;
    
    if (remaining <= 0) {
      return {
        status: 'exhausted',
        message: 'Budget already exceeded',
        spent,
        limit: budget.amount,
        exceeded: spent - budget.amount,
        daysRemaining: Math.ceil((periodEnd - currentDate) / (1000 * 60 * 60 * 24))
      };
    }
    
    // Calculate burn rate for this budget period
    const daysElapsed = Math.max(1, Math.ceil((currentDate - periodStart) / (1000 * 60 * 60 * 24)));
    const dailyBurnRate = spent / daysElapsed;
    
    if (dailyBurnRate === 0) {
      return {
        status: 'safe',
        message: 'No spending detected',
        spent,
        remaining,
        limit: budget.amount,
        daysRemaining: Math.ceil((periodEnd - currentDate) / (1000 * 60 * 60 * 24))
      };
    }
    
    // Predict exhaustion date
    const daysUntilExhaustion = remaining / dailyBurnRate;
    const exhaustionDate = new Date(currentDate.getTime() + daysUntilExhaustion * 24 * 60 * 60 * 1000);
    
    const daysRemaining = Math.ceil((periodEnd - currentDate) / (1000 * 60 * 60 * 24));
    const willExceed = exhaustionDate < periodEnd;
    
    let status = 'safe';
    let severity = 'low';
    
    if (willExceed) {
      const daysToExhaustion = Math.ceil((exhaustionDate - currentDate) / (1000 * 60 * 60 * 24));
      
      if (daysToExhaustion <= 3) {
        status = 'critical';
        severity = 'high';
      } else if (daysToExhaustion <= 7) {
        status = 'warning';
        severity = 'medium';
      } else {
        status = 'caution';
        severity = 'low';
      }
    }
    
    return {
      status,
      severity,
      spent: parseFloat(spent.toFixed(2)),
      remaining: parseFloat(remaining.toFixed(2)),
      limit: budget.amount,
      percentage: parseFloat(((spent / budget.amount) * 100).toFixed(2)),
      dailyBurnRate: parseFloat(dailyBurnRate.toFixed(2)),
      predictedExhaustionDate: willExceed ? exhaustionDate.toISOString().split('T')[0] : null,
      daysUntilExhaustion: willExceed ? Math.ceil(daysUntilExhaustion) : null,
      willExceedBudget: willExceed,
      daysRemainingInPeriod: daysRemaining,
      projectedEndAmount: parseFloat((spent + (dailyBurnRate * daysRemaining)).toFixed(2)),
      message: this._getBudgetMessage(status, willExceed, daysUntilExhaustion)
    };
  }
  
  /**
   * Analyze spending patterns by category
   * @param {String} userId - User ID
   * @param {Object} options - Options (workspaceId, daysToAnalyze)
   * @returns {Object} Category analysis
   */
  async analyzeCategoryPatterns(userId, options = {}) {
    const { workspaceId, daysToAnalyze = 30 } = options;
    
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - daysToAnalyze * 24 * 60 * 60 * 1000);
    
    const query = { 
      user: userId,
      date: { $gte: startDate, $lte: endDate }
    };
    
    if (workspaceId) query.workspace = workspaceId;
    
    const expenses = await Expense.find(query).populate('category');
    
    // Group by category
    const categoryMap = {};
    
    for (const expense of expenses) {
      const categoryId = expense.category?._id?.toString() || 'uncategorized';
      const categoryName = expense.category?.name || 'Uncategorized';
      
      if (!categoryMap[categoryId]) {
        categoryMap[categoryId] = {
          categoryId,
          categoryName,
          expenses: [],
          totalSpent: 0
        };
      }
      
      categoryMap[categoryId].expenses.push(expense);
      categoryMap[categoryId].totalSpent += expense.amount;
    }
    
    // Analyze each category
    const categoryAnalysis = [];
    
    for (const [categoryId, data] of Object.entries(categoryMap)) {
      const burnRate = await this.calculateBurnRate(userId, {
        categoryId: categoryId === 'uncategorized' ? null : categoryId,
        startDate,
        endDate,
        workspaceId
      });
      
      const prediction = await this.predictExpenses(userId, {
        categoryId: categoryId === 'uncategorized' ? null : categoryId,
        daysToPredict: 30,
        workspaceId
      });
      
      categoryAnalysis.push({
        categoryId,
        categoryName: data.categoryName,
        totalSpent: parseFloat(data.totalSpent.toFixed(2)),
        transactionCount: data.expenses.length,
        averageTransaction: parseFloat((data.totalSpent / data.expenses.length).toFixed(2)),
        burnRate,
        prediction: prediction.success ? {
          next30Days: parseFloat(prediction.cumulativePredictions[29]?.cumulativeAmount.toFixed(2) || 0),
          accuracy: prediction.model.accuracy
        } : null
      });
    }
    
    // Sort by total spent descending
    categoryAnalysis.sort((a, b) => b.totalSpent - a.totalSpent);
    
    return {
      period: { start: startDate, end: endDate },
      totalCategories: categoryAnalysis.length,
      totalSpent: parseFloat(expenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2)),
      categories: categoryAnalysis
    };
  }
  
  /**
   * Generate intelligent insights and recommendations
   * @param {String} userId - User ID
   * @returns {Object} Insights
   */
  async generateInsights(userId) {
    const user = await User.findById(userId);
    const insights = [];
    
    // Get overall burn rate
    const burnRate = await this.calculateBurnRate(userId);
    
    if (burnRate.trend === 'increasing' && burnRate.trendPercentage > 20) {
      insights.push({
        type: 'warning',
        category: 'spending_trend',
        title: 'Spending Increasing Rapidly',
        message: `Your spending has increased by ${burnRate.trendPercentage.toFixed(1)}% recently. Consider reviewing your expenses.`,
        priority: 'high',
        data: { burnRate }
      });
    }
    
    // Check all active budgets
    const budgets = await Budget.find({ 
      user: userId,
      'period.end': { $gte: new Date() }
    });
    
    for (const budget of budgets) {
      const exhaustion = await this.predictBudgetExhaustion(userId, budget._id);
      
      if (exhaustion.status === 'critical') {
        insights.push({
          type: 'alert',
          category: 'budget',
          title: 'Budget Critical',
          message: exhaustion.message,
          priority: 'critical',
          data: exhaustion
        });
      } else if (exhaustion.status === 'warning') {
        insights.push({
          type: 'warning',
          category: 'budget',
          title: 'Budget Warning',
          message: exhaustion.message,
          priority: 'high',
          data: exhaustion
        });
      }
    }
    
    // Analyze category patterns
    const categoryAnalysis = await this.analyzeCategoryPatterns(userId);
    
    // Find categories with high prediction accuracy and increasing trend
    const concerningCategories = categoryAnalysis.categories.filter(cat => 
      cat.prediction && 
      cat.prediction.accuracy > 70 && 
      cat.burnRate.trend === 'increasing'
    );
    
    for (const category of concerningCategories.slice(0, 3)) {
      insights.push({
        type: 'info',
        category: 'category_trend',
        title: `${category.categoryName} Spending Rising`,
        message: `Spending in ${category.categoryName} is trending up by ${category.burnRate.trendPercentage.toFixed(1)}%.`,
        priority: 'medium',
        data: category
      });
    }
    
    // Positive insights
    if (burnRate.trend === 'decreasing' && burnRate.trendPercentage < -10) {
      insights.push({
        type: 'success',
        category: 'spending_trend',
        title: 'Great Progress!',
        message: `You've reduced your spending by ${Math.abs(burnRate.trendPercentage).toFixed(1)}%. Keep it up!`,
        priority: 'low',
        data: { burnRate }
      });
    }
    
    return {
      timestamp: new Date(),
      insightCount: insights.length,
      insights: insights.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
    };
  }
  
  // Helper methods
  
  _groupExpensesByDay(expenses, startDate, endDate) {
    const dailyMap = {};
    const currentDate = new Date(startDate);
    
    // Initialize all days with 0
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      dailyMap[dateKey] = { date: dateKey, amount: 0, count: 0 };
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Fill in actual expenses
    for (const expense of expenses) {
      const dateKey = new Date(expense.date).toISOString().split('T')[0];
      if (dailyMap[dateKey]) {
        dailyMap[dateKey].amount += expense.amount;
        dailyMap[dateKey].count += 1;
      }
    }
    
    return Object.values(dailyMap).sort((a, b) => new Date(a.date) - new Date(b.date));
  }
  
  _linearRegression(dataPoints) {
    const n = dataPoints.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    
    dataPoints.forEach((point, index) => {
      const x = index;
      const y = point.amount;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared
    const yMean = sumY / n;
    let ssTotal = 0, ssResidual = 0;
    
    dataPoints.forEach((point, index) => {
      const yPred = slope * index + intercept;
      ssTotal += Math.pow(point.amount - yMean, 2);
      ssResidual += Math.pow(point.amount - yPred, 2);
    });
    
    const rSquared = ssTotal === 0 ? 0 : 1 - (ssResidual / ssTotal);
    
    return { slope, intercept, rSquared: Math.max(0, rSquared) };
  }
  
  _calculateWMA(dataPoints, period) {
    let weightedSum = 0;
    let weightSum = 0;
    
    dataPoints.forEach((point, index) => {
      const weight = index + 1; // Linear weights: 1, 2, 3, ..., period
      weightedSum += point.amount * weight;
      weightSum += weight;
    });
    
    return weightedSum / weightSum;
  }
  
  async _calculateBudgetSpending(userId, budget, startDate, endDate) {
    const query = {
      user: userId,
      date: { $gte: startDate, $lte: endDate }
    };
    
    if (budget.category) {
      query.category = budget.category;
    }
    
    if (budget.workspace) {
      query.workspace = budget.workspace;
    }
    
    const expenses = await Expense.find(query);
    return expenses.reduce((sum, exp) => sum + exp.amount, 0);
  }
  
  _getBudgetMessage(status, willExceed, daysUntilExhaustion) {
    if (status === 'critical') {
      return `Budget will be exceeded in ${Math.ceil(daysUntilExhaustion)} days at current spending rate. Immediate action recommended.`;
    } else if (status === 'warning') {
      return `Budget projected to exceed in ${Math.ceil(daysUntilExhaustion)} days. Consider reducing spending.`;
    } else if (status === 'caution') {
      return `Budget on track to exceed by end of period. Monitor spending closely.`;
    }
    return 'Budget spending is within safe limits.';
  }
}

module.exports = new IntelligenceService();
