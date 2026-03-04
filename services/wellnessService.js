const Expense = require('../models/Expense');
const Budget = require('../models/Budget');
const Goal = require('../models/Goal');
const Insight = require('../models/Insight');
const User = require('../models/User');

/**
 * Financial Wellness Service
 * Calculates comprehensive health score (1-100) based on multiple financial factors
 */
class WellnessService {
  /**
   * Calculate comprehensive financial health score
   * @param {String} userId - User ID
   * @param {Object} options - Calculation options
   * @returns {Object} Health score with breakdown
   */
  async calculateHealthScore(userId, options = {}) {
    try {
      const timeWindow = options.timeWindow || 30; // days
      const endDate = new Date();
      const startDate = new Date(endDate - timeWindow * 24 * 60 * 60 * 1000);

      // Gather all financial data
      const [
        expenses,
        budgets,
        goals,
        user,
        previousScore
      ] = await Promise.all([
        Expense.find({
          user: userId,
          date: { $gte: startDate, $lte: endDate }
        }),
        Budget.find({ user: userId }),
        Goal.find({ user: userId, status: { $in: ['in_progress', 'active'] } }),
        User.findById(userId),
        this.getPreviousHealthScore(userId)
      ]);

      // Calculate individual components
      const components = {
        budgetAdherence: await this.calculateBudgetAdherence(userId, budgets, expenses),
        savingsRate: await this.calculateSavingsRate(userId, expenses, timeWindow),
        spendingVelocity: await this.calculateSpendingVelocity(userId, expenses, timeWindow),
        incomeStability: await this.calculateIncomeStability(userId, expenses, timeWindow),
        debtManagement: await this.calculateDebtManagement(userId, expenses),
        goalProgress: await this.calculateGoalProgress(userId, goals),
        emergencyFund: await this.calculateEmergencyFund(userId, expenses),
        diversification: await this.calculateSpendingDiversification(expenses),
        consistency: await this.calculateConsistency(userId, expenses, timeWindow),
        trendDirection: await this.calculateTrendDirection(userId, expenses, previousScore)
      };

      // Calculate weighted overall score
      const weights = {
        budgetAdherence: 0.20,    // 20% - Most important
        savingsRate: 0.15,        // 15%
        spendingVelocity: 0.15,   // 15%
        incomeStability: 0.12,    // 12%
        debtManagement: 0.10,     // 10%
        goalProgress: 0.10,       // 10%
        emergencyFund: 0.08,      // 8%
        diversification: 0.05,    // 5%
        consistency: 0.03,        // 3%
        trendDirection: 0.02      // 2%
      };

      let totalScore = 0;
      Object.keys(components).forEach(key => {
        totalScore += components[key].score * weights[key];
      });

      // Round to whole number
      totalScore = Math.round(Math.max(1, Math.min(100, totalScore)));

      // Determine grade and status
      const grade = this.getGrade(totalScore);
      const status = this.getHealthStatus(totalScore);
      const color = this.getHealthColor(totalScore);

      // Calculate score change
      const scoreChange = previousScore ? totalScore - previousScore.score : 0;
      const scoreChangePercent = previousScore 
        ? Math.round(((totalScore - previousScore.score) / previousScore.score) * 100)
        : 0;

      // Generate insights based on score
      const insights = await this.generateInsightsFromScore(userId, components, totalScore);

      // Build comprehensive result
      const result = {
        score: totalScore,
        grade,
        status,
        color,
        previousScore: previousScore?.score || null,
        scoreChange,
        scoreChangePercent,
        trend: scoreChange > 0 ? 'improving' : scoreChange < 0 ? 'declining' : 'stable',
        components,
        insights,
        strengths: this.identifyStrengths(components),
        weaknesses: this.identifyWeaknesses(components),
        recommendations: await this.generateRecommendations(userId, components, totalScore),
        calculatedAt: new Date(),
        timeWindow
      };

      // Save health score to user
      await this.saveHealthScore(userId, result);

      return result;
    } catch (error) {
      console.error('[WellnessService] Error calculating health score:', error);
      throw error;
    }
  }

  /**
   * Calculate budget adherence score (0-100)
   */
  async calculateBudgetAdherence(userId, budgets, expenses) {
    if (!budgets || budgets.length === 0) {
      return {
        score: 50,
        details: { message: 'No budgets set', hasBudgets: false }
      };
    }

    const activeBudgets = budgets.filter(b => b.status === 'active');
    if (activeBudgets.length === 0) {
      return {
        score: 50,
        details: { message: 'No active budgets', activeBudgets: 0 }
      };
    }

    let totalUtilization = 0;
    let totalBudgets = activeBudgets.length;
    let exceededCount = 0;

    activeBudgets.forEach(budget => {
      const budgetExpenses = expenses.filter(e => 
        e.category === budget.category && 
        e.type === 'expense'
      );
      
      const spent = budgetExpenses.reduce((sum, e) => sum + e.amount, 0);
      const utilization = (spent / budget.amount) * 100;
      totalUtilization += utilization;
      
      if (utilization > 100) exceededCount++;
    });

    const avgUtilization = totalUtilization / totalBudgets;
    
    // Score calculation: 100 = perfect (50-80% utilization), decreases for over/under
    let score = 100;
    if (avgUtilization > 100) {
      score = Math.max(0, 100 - (avgUtilization - 100) * 2);
    } else if (avgUtilization < 50) {
      score = 70 + (avgUtilization / 50) * 30;
    } else if (avgUtilization > 80 && avgUtilization <= 100) {
      score = 100 - (avgUtilization - 80) * 1.5;
    }

    return {
      score: Math.round(score),
      details: {
        averageUtilization: Math.round(avgUtilization),
        totalBudgets,
        exceededBudgets: exceededCount,
        onTrackBudgets: totalBudgets - exceededCount
      }
    };
  }

  /**
   * Calculate savings rate score (0-100)
   */
  async calculateSavingsRate(userId, expenses, timeWindow) {
    const totalIncome = expenses
      .filter(e => e.type === 'income')
      .reduce((sum, e) => sum + e.amount, 0);
    
    const totalExpenses = expenses
      .filter(e => e.type === 'expense')
      .reduce((sum, e) => sum + e.amount, 0);

    if (totalIncome === 0) {
      return {
        score: 30,
        details: { message: 'No income recorded', savingsRate: 0 }
      };
    }

    const netSavings = totalIncome - totalExpenses;
    const savingsRate = (netSavings / totalIncome) * 100;

    // Score: 20%+ savings = 100, linear decrease to 0% = 0
    let score = 0;
    if (savingsRate >= 20) {
      score = 100;
    } else if (savingsRate > 0) {
      score = (savingsRate / 20) * 100;
    } else if (savingsRate < 0) {
      // Spending more than income
      score = Math.max(0, 50 + savingsRate * 2);
    }

    return {
      score: Math.round(score),
      details: {
        savingsRate: Math.round(savingsRate * 10) / 10,
        totalIncome: Math.round(totalIncome),
        totalExpenses: Math.round(totalExpenses),
        netSavings: Math.round(netSavings)
      }
    };
  }

  /**
   * Calculate spending velocity score (0-100)
   * Measures if spending rate is sustainable
   */
  async calculateSpendingVelocity(userId, expenses, timeWindow) {
    const expensesByDay = {};
    const today = new Date();
    
    expenses.filter(e => e.type === 'expense').forEach(expense => {
      const dayKey = new Date(expense.date).toISOString().split('T')[0];
      expensesByDay[dayKey] = (expensesByDay[dayKey] || 0) + expense.amount;
    });

    const dailyAmounts = Object.values(expensesByDay);
    if (dailyAmounts.length === 0) {
      return {
        score: 70,
        details: { message: 'No expenses to analyze', velocity: 0 }
      };
    }

    const avgDailySpending = dailyAmounts.reduce((a, b) => a + b, 0) / dailyAmounts.length;
    const stdDev = Math.sqrt(
      dailyAmounts.reduce((sum, val) => sum + Math.pow(val - avgDailySpending, 2), 0) / dailyAmounts.length
    );
    
    const coefficientOfVariation = stdDev / avgDailySpending;

    // Lower variation = better score
    let score = 100;
    if (coefficientOfVariation > 1.5) {
      score = Math.max(30, 100 - coefficientOfVariation * 30);
    } else if (coefficientOfVariation > 0.8) {
      score = Math.max(60, 100 - coefficientOfVariation * 40);
    } else {
      score = Math.max(80, 100 - coefficientOfVariation * 20);
    }

    return {
      score: Math.round(score),
      details: {
        avgDailySpending: Math.round(avgDailySpending),
        variation: Math.round(coefficientOfVariation * 100) / 100,
        consistency: coefficientOfVariation < 0.5 ? 'excellent' : 
                     coefficientOfVariation < 1.0 ? 'good' : 
                     coefficientOfVariation < 1.5 ? 'fair' : 'poor'
      }
    };
  }

  /**
   * Calculate income stability score (0-100)
   */
  async calculateIncomeStability(userId, expenses, timeWindow) {
    const incomes = expenses.filter(e => e.type === 'income');
    
    if (incomes.length === 0) {
      return {
        score: 30,
        details: { message: 'No income recorded', stability: 'unknown' }
      };
    }

    // Group by month
    const monthlyIncome = {};
    incomes.forEach(income => {
      const monthKey = new Date(income.date).toISOString().substring(0, 7);
      monthlyIncome[monthKey] = (monthlyIncome[monthKey] || 0) + income.amount;
    });

    const amounts = Object.values(monthlyIncome);
    if (amounts.length < 2) {
      return {
        score: 70,
        details: { message: 'Insufficient data', months: amounts.length }
      };
    }

    const avgIncome = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, val) => sum + Math.pow(val - avgIncome, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / avgIncome;

    // Lower CV = higher stability
    let score = 100;
    if (cv > 0.5) {
      score = Math.max(20, 100 - cv * 100);
    } else if (cv > 0.3) {
      score = Math.max(60, 100 - cv * 120);
    } else {
      score = Math.max(80, 100 - cv * 50);
    }

    return {
      score: Math.round(score),
      details: {
        avgMonthlyIncome: Math.round(avgIncome),
        variability: Math.round(cv * 100) / 100,
        stability: cv < 0.2 ? 'excellent' : cv < 0.4 ? 'good' : cv < 0.6 ? 'fair' : 'poor',
        months: amounts.length
      }
    };
  }

  /**
   * Calculate debt management score (0-100)
   */
  async calculateDebtManagement(userId, expenses) {
    // Look for debt-related expenses
    const debtCategories = ['debt_payment', 'loan', 'credit_card', 'loan_payment'];
    const debtExpenses = expenses.filter(e => 
      e.type === 'expense' && 
      (debtCategories.includes(e.category) || 
       e.description?.toLowerCase().includes('debt') ||
       e.description?.toLowerCase().includes('loan'))
    );

    const totalExpenses = expenses.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
    const totalDebt = debtExpenses.reduce((sum, e) => sum + e.amount, 0);

    if (totalExpenses === 0) {
      return {
        score: 70,
        details: { message: 'No expense data', debtRatio: 0 }
      };
    }

    const debtRatio = (totalDebt / totalExpenses) * 100;

    // Score: 0% debt = 100, 30%+ = 0
    let score = 100;
    if (debtRatio >= 30) {
      score = 0;
    } else {
      score = 100 - (debtRatio / 30) * 100;
    }

    return {
      score: Math.round(score),
      details: {
        debtRatio: Math.round(debtRatio * 10) / 10,
        monthlyDebtPayments: Math.round(totalDebt),
        status: debtRatio < 10 ? 'excellent' : debtRatio < 20 ? 'good' : debtRatio < 30 ? 'fair' : 'poor'
      }
    };
  }

  /**
   * Calculate goal progress score (0-100)
   */
  async calculateGoalProgress(userId, goals) {
    if (!goals || goals.length === 0) {
      return {
        score: 50,
        details: { message: 'No goals set', goalsCount: 0 }
      };
    }

    let totalProgress = 0;
    let goalsOnTrack = 0;

    goals.forEach(goal => {
      const progress = (goal.current / goal.target) * 100;
      totalProgress += Math.min(100, progress);
      
      if (progress >= 50) goalsOnTrack++;
    });

    const avgProgress = totalProgress / goals.length;
    const score = Math.min(100, avgProgress);

    return {
      score: Math.round(score),
      details: {
        totalGoals: goals.length,
        goalsOnTrack,
        averageProgress: Math.round(avgProgress),
        completionRate: Math.round((goalsOnTrack / goals.length) * 100)
      }
    };
  }

  /**
   * Calculate emergency fund adequacy score (0-100)
   */
  async calculateEmergencyFund(userId, expenses) {
    const monthlyExpenses = expenses
      .filter(e => e.type === 'expense')
      .reduce((sum, e) => sum + e.amount, 0);
    
    const avgMonthlyExpense = monthlyExpenses / (expenses.length > 0 ? 
      (Math.max(1, (new Date() - new Date(expenses[0].date)) / (1000 * 60 * 60 * 24 * 30))) : 1);

    // This would ideally check actual savings/emergency fund balance
    // For now, use a simplified heuristic
    const savingsGoal = await Goal.findOne({ 
      user: userId, 
      type: 'emergency_fund'
    });

    if (!savingsGoal) {
      return {
        score: 40,
        details: { message: 'No emergency fund goal set', months: 0 }
      };
    }

    const monthsCovered = savingsGoal.current / avgMonthlyExpense;
    
    // Score: 6+ months = 100, linear scale
    let score = 0;
    if (monthsCovered >= 6) {
      score = 100;
    } else if (monthsCovered >= 3) {
      score = 60 + ((monthsCovered - 3) / 3) * 40;
    } else {
      score = (monthsCovered / 3) * 60;
    }

    return {
      score: Math.round(score),
      details: {
        monthsCovered: Math.round(monthsCovered * 10) / 10,
        recommendedMonths: 6,
        currentAmount: Math.round(savingsGoal.current),
        status: monthsCovered >= 6 ? 'excellent' : 
                monthsCovered >= 3 ? 'good' : 
                monthsCovered >= 1 ? 'fair' : 'critical'
      }
    };
  }

  /**
   * Calculate spending diversification score (0-100)
   */
  calculateSpendingDiversification(expenses) {
    const categorySpending = {};
    const totalSpending = expenses
      .filter(e => e.type === 'expense')
      .reduce((sum, e) => {
        categorySpending[e.category] = (categorySpending[e.category] || 0) + e.amount;
        return sum + e.amount;
      }, 0);

    if (totalSpending === 0) {
      return {
        score: 50,
        details: { message: 'No expenses', categories: 0 }
      };
    }

    // Calculate Herfindahl index (measure of concentration)
    let herfindahl = 0;
    Object.values(categorySpending).forEach(amount => {
      const share = amount / totalSpending;
      herfindahl += share * share;
    });

    // Lower herfindahl = better diversification
    // 1.0 = all in one category, 0.1 = evenly distributed across 10
    const score = Math.max(0, (1 - herfindahl) * 100);

    return {
      score: Math.round(score),
      details: {
        categories: Object.keys(categorySpending).length,
        concentration: Math.round(herfindahl * 100) / 100,
        diversification: herfindahl < 0.3 ? 'excellent' : herfindahl < 0.5 ? 'good' : 'poor'
      }
    };
  }

  /**
   * Calculate consistency score (0-100)
   */
  async calculateConsistency(userId, expenses, timeWindow) {
    // Measures day-to-day spending consistency
    const dailySpending = {};
    
    expenses.filter(e => e.type === 'expense').forEach(expense => {
      const dayKey = new Date(expense.date).toISOString().split('T')[0];
      dailySpending[dayKey] = (dailySpending[dayKey] || 0) + 1;
    });

    const days = Object.keys(dailySpending).length;
    const transactionFrequency = days / timeWindow;

    // Score based on regular spending patterns
    let score = 50;
    if (transactionFrequency >= 0.5 && transactionFrequency <= 1.0) {
      score = 100;
    } else if (transactionFrequency >= 0.3 || transactionFrequency <= 1.5) {
      score = 80;
    } else {
      score = 60;
    }

    return {
      score,
      details: {
        daysWithTransactions: days,
        frequency: Math.round(transactionFrequency * 100) / 100
      }
    };
  }

  /**
   * Calculate trend direction score (0-100)
   */
  async calculateTrendDirection(userId, expenses, previousScore) {
    if (!previousScore) {
      return {
        score: 50,
        details: { message: 'No previous score for comparison' }
      };
    }

    // Compare current vs previous spending patterns
    const recentExpenses = expenses.filter(e => {
      const daysSince = (new Date() - new Date(e.date)) / (1000 * 60 * 60 * 24);
      return daysSince <= 7 && e.type === 'expense';
    });

    const olderExpenses = expenses.filter(e => {
      const daysSince = (new Date() - new Date(e.date)) / (1000 * 60 * 60 * 24);
      return daysSince > 7 && daysSince <= 14 && e.type === 'expense';
    });

    const recentAvg = recentExpenses.reduce((sum, e) => sum + e.amount, 0) / Math.max(1, recentExpenses.length);
    const olderAvg = olderExpenses.reduce((sum, e) => sum + e.amount, 0) / Math.max(1, olderExpenses.length);

    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    // Decreasing spending = higher score
    let score = 50;
    if (change < -10) {
      score = 100;
    } else if (change < 0) {
      score = 75 + (Math.abs(change) / 10) * 25;
    } else if (change < 10) {
      score = 50 - (change / 10) * 25;
    } else {
      score = Math.max(0, 25 - (change - 10) * 2);
    }

    return {
      score: Math.round(score),
      details: {
        recentAvgDaily: Math.round(recentAvg),
        previousAvgDaily: Math.round(olderAvg),
        changePercent: Math.round(change * 10) / 10,
        trend: change < 0 ? 'improving' : change > 0 ? 'worsening' : 'stable'
      }
    };
  }

  /**
   * Get health grade based on score
   */
  getGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'A-';
    if (score >= 75) return 'B+';
    if (score >= 70) return 'B';
    if (score >= 65) return 'B-';
    if (score >= 60) return 'C+';
    if (score >= 55) return 'C';
    if (score >= 50) return 'C-';
    if (score >= 45) return 'D+';
    if (score >= 40) return 'D';
    return 'F';
  }

  /**
   * Get health status description
   */
  getHealthStatus(score) {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 55) return 'Fair';
    if (score >= 40) return 'Poor';
    return 'Critical';
  }

  /**
   * Get health color for UI
   */
  getHealthColor(score) {
    if (score >= 80) return '#00b75e'; // Green
    if (score >= 60) return '#4facfe'; // Blue
    if (score >= 40) return '#ffc107'; // Yellow
    return '#ff855e'; // Red
  }

  /**
   * Identify strengths from components
   */
  identifyStrengths(components) {
    return Object.entries(components)
      .filter(([key, value]) => value.score >= 75)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3)
      .map(([key, value]) => ({
        component: key,
        score: value.score,
        label: this.getComponentLabel(key)
      }));
  }

  /**
   * Identify weaknesses from components
   */
  identifyWeaknesses(components) {
    return Object.entries(components)
      .filter(([key, value]) => value.score < 60)
      .sort((a, b) => a[1].score - b[1].score)
      .slice(0, 3)
      .map(([key, value]) => ({
        component: key,
        score: value.score,
        label: this.getComponentLabel(key),
        priority: value.score < 40 ? 'critical' : value.score < 50 ? 'high' : 'medium'
      }));
  }

  /**
   * Get component label
   */
  getComponentLabel(key) {
    const labels = {
      budgetAdherence: 'Budget Adherence',
      savingsRate: 'Savings Rate',
      spendingVelocity: 'Spending Velocity',
      incomeStability: 'Income Stability',
      debtManagement: 'Debt Management',
      goalProgress: 'Goal Progress',
      emergencyFund: 'Emergency Fund',
      diversification: 'Spending Diversification',
      consistency: 'Spending Consistency',
      trendDirection: 'Trend Direction'
    };
    return labels[key] || key;
  }

  /**
   * Generate recommendations based on score
   */
  async generateRecommendations(userId, components, totalScore) {
    const recommendations = [];

    // Budget adherence recommendations
    if (components.budgetAdherence.score < 60) {
      recommendations.push({
        priority: 'high',
        title: 'Improve Budget Adherence',
        message: components.budgetAdherence.details.exceededBudgets > 0
          ? `You've exceeded ${components.budgetAdherence.details.exceededBudgets} budget(s). Review your spending categories.`
          : 'Set realistic budgets for your major spending categories.',
        action: 'review_budgets'
      });
    }

    // Savings rate recommendations
    if (components.savingsRate.score < 50) {
      recommendations.push({
        priority: 'critical',
        title: 'Increase Savings Rate',
        message: components.savingsRate.details.savingsRate < 0
          ? '⚠️ You\'re spending more than you earn. This is unsustainable.'
          : `Your savings rate is ${components.savingsRate.details.savingsRate}%. Aim for at least 20%.`,
        action: 'increase_savings'
      });
    }

    // Emergency fund recommendations
    if (components.emergencyFund.score < 60) {
      recommendations.push({
        priority: 'high',
        title: 'Build Emergency Fund',
        message: `You have ${components.emergencyFund.details.monthsCovered || 0} months of expenses saved. Aim for 6 months.`,
        action: 'build_emergency_fund'
      });
    }

    // Debt management recommendations
    if (components.debtManagement.score < 70) {
      recommendations.push({
        priority: 'medium',
        title: 'Reduce Debt Burden',
        message: `Debt payments are ${components.debtManagement.details.debtRatio}% of your expenses. Consider debt reduction strategies.`,
        action: 'reduce_debt'
      });
    }

    return recommendations;
  }

  /**
   * Generate insights from score calculation
   */
  async generateInsightsFromScore(userId, components, totalScore) {
    const insights = [];

    // Critical insights for very low components
    Object.entries(components).forEach(([key, value]) => {
      if (value.score < 40) {
        insights.push({
          type: 'health_score_drop',
          priority: 'critical',
          component: key,
          score: value.score,
          impact: 'negative'
        });
      }
    });

    return insights;
  }

  /**
   * Get previous health score
   */
  async getPreviousHealthScore(userId) {
    const user = await User.findById(userId);
    return user?.healthScore || null;
  }

  /**
   * Save health score to user
   */
  async saveHealthScore(userId, scoreData) {
    await User.findByIdAndUpdate(userId, {
      healthScore: {
        score: scoreData.score,
        grade: scoreData.grade,
        status: scoreData.status,
        calculatedAt: scoreData.calculatedAt,
        components: Object.fromEntries(
          Object.entries(scoreData.components).map(([k, v]) => [k, v.score])
        )
      }
    });
  }
}

module.exports = new WellnessService();
