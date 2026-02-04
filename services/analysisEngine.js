const Expense = require('../models/Expense');
const Budget = require('../models/Budget');
const Insight = require('../models/Insight');

/**
 * Analysis Engine for Pattern Recognition and Smart Insights
 * Detects spending patterns, velocity changes, and generates actionable advice
 */
class AnalysisEngine {
  /**
   * Analyze spending velocity by category
   * Detects if spending rate will cause budget exhaustion
   */
  async analyzeSpendingVelocity(userId, options = {}) {
    const category = options.category || null;
    const timeWindow = options.timeWindow || 7; // days
    const endDate = new Date();
    const startDate = new Date(endDate - timeWindow * 24 * 60 * 60 * 1000);

    const expenses = await Expense.find({
      user: userId,
      type: 'expense',
      date: { $gte: startDate, $lte: endDate },
      ...(category && { category })
    }).sort({ date: 1 });

    if (expenses.length < 2) {
      return { insights: [], message: 'Insufficient data for velocity analysis' };
    }

    // Group by category
    const categoryAnalysis = {};
    
    expenses.forEach(expense => {
      if (!categoryAnalysis[expense.category]) {
        categoryAnalysis[expense.category] = {
          expenses: [],
          total: 0,
          count: 0
        };
      }
      categoryAnalysis[expense.category].expenses.push(expense);
      categoryAnalysis[expense.category].total += expense.amount;
      categoryAnalysis[expense.category].count++;
    });

    // Analyze each category
    const insights = [];
    
    for (const [cat, data] of Object.entries(categoryAnalysis)) {
      const budget = await Budget.findOne({ 
        user: userId, 
        category: cat,
        status: 'active'
      });

      if (!budget) continue;

      // Calculate velocity
      const dailyAverage = data.total / timeWindow;
      const daysInMonth = 30;
      const projectedMonthly = dailyAverage * daysInMonth;
      const budgetUtilization = (data.total / budget.amount) * 100;
      const daysRemaining = daysInMonth - timeWindow;
      const projectedTotal = data.total + (dailyAverage * daysRemaining);
      const projectedUtilization = (projectedTotal / budget.amount) * 100;

      // Compare with previous period
      const previousPeriodStart = new Date(startDate - timeWindow * 24 * 60 * 60 * 1000);
      const previousExpenses = await Expense.find({
        user: userId,
        type: 'expense',
        category: cat,
        date: { $gte: previousPeriodStart, $lt: startDate }
      });

      const previousTotal = previousExpenses.reduce((sum, e) => sum + e.amount, 0);
      const velocityChange = previousTotal > 0 
        ? ((data.total - previousTotal) / previousTotal) * 100 
        : 0;

      // Generate insight if velocity is concerning
      if (projectedUtilization > 100 || velocityChange > 20) {
        const daysUntilExhaustion = budget.amount > data.total 
          ? (budget.amount - data.total) / dailyAverage 
          : 0;

        const insight = await Insight.create({
          user: userId,
          type: 'velocity_warning',
          priority: projectedUtilization > 120 ? 'critical' : 'high',
          title: `${cat} Budget Alert`,
          message: velocityChange > 20
            ? `Your ${cat} spending velocity is ${Math.round(velocityChange)}% higher this week. At this rate, you'll exhaust your ${cat} budget in ${Math.ceil(daysUntilExhaustion)} days.`
            : `Your ${cat} spending is projected to exceed budget by ${Math.round(projectedUtilization - 100)}% this month.`,
          category: cat,
          metrics: {
            current_velocity: Math.round(dailyAverage * 10) / 10,
            velocity_change_percent: Math.round(velocityChange),
            budget_utilization: Math.round(budgetUtilization),
            days_until_budget_exhausted: Math.ceil(daysUntilExhaustion),
            projected_overage: Math.round(projectedTotal - budget.amount)
          },
          relatedBudget: budget._id,
          actions: [
            {
              label: 'Reduce spending in this category',
              type: 'reduce_spending',
              data: { category: cat, targetReduction: Math.round(projectedTotal - budget.amount) }
            },
            {
              label: 'Adjust budget amount',
              type: 'adjust_budget',
              data: { budgetId: budget._id, suggestedAmount: Math.round(projectedTotal) }
            }
          ],
          confidence: velocityChange > 50 ? 95 : velocityChange > 20 ? 85 : 75,
          source: 'velocity_monitor'
        });

        insights.push(insight);
      }

      // Positive insight for good velocity
      if (budgetUtilization < 70 && velocityChange < -10) {
        const insight = await Insight.create({
          user: userId,
          type: 'positive_trend',
          priority: 'info',
          title: `Great ${cat} Spending!`,
          message: `Your ${cat} spending is ${Math.round(Math.abs(velocityChange))}% lower than last week. You're well within budget!`,
          category: cat,
          metrics: {
            current_velocity: Math.round(dailyAverage * 10) / 10,
            velocity_change_percent: Math.round(velocityChange),
            budget_utilization: Math.round(budgetUtilization)
          },
          impact: {
            financial: 'positive',
            score: 5
          },
          confidence: 90,
          source: 'velocity_monitor'
        });

        insights.push(insight);
      }
    }

    return { insights, analyzed: Object.keys(categoryAnalysis).length };
  }

  /**
   * Detect spending anomalies
   * Identifies unusual transactions or patterns
   */
  async detectAnomalies(userId, options = {}) {
    const timeWindow = options.timeWindow || 30;
    const endDate = new Date();
    const startDate = new Date(endDate - timeWindow * 24 * 60 * 60 * 1000);

    const expenses = await Expense.find({
      user: userId,
      type: 'expense',
      date: { $gte: startDate, $lte: endDate }
    });

    if (expenses.length < 10) {
      return { anomalies: [], message: 'Insufficient data' };
    }

    // Calculate statistics by category
    const categoryStats = {};
    expenses.forEach(expense => {
      if (!categoryStats[expense.category]) {
        categoryStats[expense.category] = {
          amounts: [],
          total: 0,
          count: 0
        };
      }
      categoryStats[expense.category].amounts.push(expense.amount);
      categoryStats[expense.category].total += expense.amount;
      categoryStats[expense.category].count++;
    });

    // Calculate mean and std deviation
    Object.keys(categoryStats).forEach(category => {
      const amounts = categoryStats[category].amounts;
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
      const stdDev = Math.sqrt(variance);
      
      categoryStats[category].mean = mean;
      categoryStats[category].stdDev = stdDev;
    });

    // Detect anomalies (> 2 standard deviations)
    const anomalies = [];
    
    for (const expense of expenses) {
      const stats = categoryStats[expense.category];
      if (!stats) continue;

      const zScore = (expense.amount - stats.mean) / stats.stdDev;
      
      if (Math.abs(zScore) > 2) {
        const insight = await Insight.create({
          user: userId,
          type: 'anomaly_detected',
          priority: Math.abs(zScore) > 3 ? 'high' : 'medium',
          title: 'Unusual Transaction Detected',
          message: `Your ${expense.category} expense of ₹${expense.amount} is ${Math.round(Math.abs(zScore))}x your average. This is ${Math.round(Math.abs((expense.amount - stats.mean) / stats.mean) * 100)}% ${expense.amount > stats.mean ? 'higher' : 'lower'} than usual.`,
          category: expense.category,
          metrics: {
            transaction_amount: expense.amount,
            category_average: Math.round(stats.mean),
            deviation_multiplier: Math.round(Math.abs(zScore) * 10) / 10
          },
          relatedTransactions: [expense._id],
          actions: [
            {
              label: 'Review this transaction',
              type: 'review_transaction',
              data: { expenseId: expense._id }
            }
          ],
          confidence: 85,
          source: 'pattern_detection'
        });

        anomalies.push(insight);
      }
    }

    return { anomalies, detected: anomalies.length };
  }

  /**
   * Analyze budget predictions
   * Predicts when budgets will be exhausted
   */
  async analyzeBudgetPredictions(userId) {
    const budgets = await Budget.find({ user: userId, status: 'active' });
    const insights = [];

    for (const budget of budgets) {
      // Get expenses for this budget period
      const expenses = await Expense.find({
        user: userId,
        type: 'expense',
        category: budget.category,
        date: { $gte: budget.startDate, $lte: budget.endDate }
      });

      const spent = expenses.reduce((sum, e) => sum + e.amount, 0);
      const remaining = budget.amount - spent;
      const utilization = (spent / budget.amount) * 100;

      // Calculate days into period
      const totalDays = (budget.endDate - budget.startDate) / (1000 * 60 * 60 * 24);
      const daysElapsed = (new Date() - budget.startDate) / (1000 * 60 * 60 * 24);
      const daysRemaining = totalDays - daysElapsed;
      
      // Calculate daily burn rate
      const dailyBurnRate = spent / daysElapsed;
      const projectedTotal = spent + (dailyBurnRate * daysRemaining);
      const daysUntilExhaustion = remaining > 0 ? remaining / dailyBurnRate : 0;

      // Generate insight if budget will be exceeded
      if (projectedTotal > budget.amount && daysRemaining > 0) {
        const insight = await Insight.create({
          user: userId,
          type: 'budget_prediction',
          priority: daysUntilExhaustion < 7 ? 'critical' : daysUntilExhaustion < 14 ? 'high' : 'medium',
          title: `${budget.category} Budget Warning`,
          message: daysUntilExhaustion < daysRemaining
            ? `At your current pace, you'll run out of ${budget.category} budget in ${Math.ceil(daysUntilExhaustion)} days (${Math.ceil(daysRemaining - daysUntilExhaustion)} days before period ends).`
            : `You're on track to exceed your ${budget.category} budget by ₹${Math.round(projectedTotal - budget.amount)} this period.`,
          category: budget.category,
          metrics: {
            current_velocity: Math.round(dailyBurnRate * 10) / 10,
            budget_utilization: Math.round(utilization),
            days_until_budget_exhausted: Math.ceil(daysUntilExhaustion),
            projected_overage: Math.round(projectedTotal - budget.amount)
          },
          relatedBudget: budget._id,
          actions: [
            {
              label: `Reduce ${budget.category} spending`,
              type: 'reduce_spending',
              data: { 
                category: budget.category, 
                dailyTarget: Math.round(remaining / daysRemaining * 10) / 10
              }
            },
            {
              label: 'Increase budget',
              type: 'adjust_budget',
              data: { budgetId: budget._id, suggestedAmount: Math.round(projectedTotal) }
            }
          ],
          confidence: daysElapsed > 7 ? 90 : 70,
          source: 'budget_tracker',
          visualization: {
            chartType: 'trend',
            data: {
              spent,
              budget: budget.amount,
              projected: Math.round(projectedTotal),
              daysRemaining: Math.ceil(daysRemaining)
            }
          }
        });

        insights.push(insight);
      }
    }

    return { insights, budgetsAnalyzed: budgets.length };
  }

  /**
   * Find savings opportunities
   * Identifies areas where user can reduce spending
   */
  async findSavingsOpportunities(userId) {
    const timeWindow = 30;
    const endDate = new Date();
    const startDate = new Date(endDate - timeWindow * 24 * 60 * 60 * 1000);

    const expenses = await Expense.find({
      user: userId,
      type: 'expense',
      date: { $gte: startDate, $lte: endDate }
    });

    // Analyze high-frequency, low-value expenses
    const merchantExpenses = {};
    expenses.forEach(expense => {
      const merchant = expense.merchant || expense.description;
      if (!merchantExpenses[merchant]) {
        merchantExpenses[merchant] = {
          count: 0,
          total: 0,
          category: expense.category
        };
      }
      merchantExpenses[merchant].count++;
      merchantExpenses[merchant].total += expense.amount;
    });

    const insights = [];

    // Find frequent small purchases that add up
    for (const [merchant, data] of Object.entries(merchantExpenses)) {
      if (data.count >= 10) {  // 10+ times in 30 days
        const avgAmount = data.total / data.count;
        const monthlyProjection = (data.total / timeWindow) * 30;

        const insight = await Insight.create({
          user: userId,
          type: 'savings_opportunity',
          priority: monthlyProjection > 500 ? 'high' : 'medium',
          title: 'Frequent Small Purchases Add Up',
          message: `You've spent ₹${Math.round(data.total)} at ${merchant} ${data.count} times this month (avg ₹${Math.round(avgAmount)} per visit). This projects to ₹${Math.round(monthlyProjection)}/month.`,
          category: data.category,
          metrics: {
            frequency: data.count,
            total_spent: Math.round(data.total),
            potential_savings: Math.round(monthlyProjection * 0.3), // 30% reduction target
            monthly_projection: Math.round(monthlyProjection)
          },
          actions: [
            {
              label: 'Set a limit for this merchant',
              type: 'reduce_spending',
              data: { merchant, category: data.category }
            }
          ],
          confidence: 85,
          source: 'pattern_detection'
        });

        insights.push(insight);
      }
    }

    return { insights, opportunities: insights.length };
  }

  /**
   * Compare category spending vs peers/norms
   */
  async compareToPeers(userId) {
    // Simplified peer comparison based on typical spending patterns
    const expenses = await Expense.find({
      user: userId,
      type: 'expense',
      date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    const totalIncome = await Expense.find({
      user: userId,
      type: 'income',
      date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).then(incomes => incomes.reduce((sum, i) => sum + i.amount, 0));

    // Typical spending percentages
    const typicalPercentages = {
      food: 15,
      transport: 10,
      entertainment: 8,
      utilities: 10,
      healthcare: 8,
      shopping: 12,
      housing: 30
    };

    const categorySpending = {};
    expenses.forEach(e => {
      categorySpending[e.category] = (categorySpending[e.category] || 0) + e.amount;
    });

    const insights = [];

    Object.entries(categorySpending).forEach(([category, amount]) => {
      const percentage = (amount / totalIncome) * 100;
      const typical = typicalPercentages[category] || 10;
      
      if (percentage > typical * 1.5) {  // 50% above typical
        insights.push({
          category,
          userPercent: Math.round(percentage),
          typicalPercent: typical,
          difference: Math.round(percentage - typical),
          message: `Your ${category} spending (${Math.round(percentage)}% of income) is higher than typical (${typical}%).`
        });
      }
    });

    return insights;
  }

  /**
   * Run comprehensive financial analysis
   */
  async runComprehensiveAnalysis(userId) {
    console.log(`[AnalysisEngine] Running comprehensive analysis for user ${userId}`);

    const results = await Promise.allSettled([
      this.analyzeSpendingVelocity(userId),
      this.detectAnomalies(userId),
      this.analyzeBudgetPredictions(userId),
      this.findSavingsOpportunities(userId)
    ]);

    const insights = [];
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.insights) {
        insights.push(...result.value.insights);
      }
    });

    console.log(`[AnalysisEngine] Generated ${insights.length} insights`);

    return {
      totalInsights: insights.length,
      insights: insights.slice(0, 20),  // Return top 20
      analysisComplete: true,
      timestamp: new Date()
    };
  }
}

module.exports = new AnalysisEngine();
