/**
 * Financial Health Score & Gamification Service
 * Issue #421: Dynamic Financial Health Score (0-100) with 5 parameters
 * 
 * Score Components:
 * 1. Savings Rate (20%) - Monthly savings as % of income
 * 2. Budget Discipline (25%) - How well user sticks to budgets
 * 3. Debt-to-Income Ratio (20%) - Monthly debt payments vs income
 * 4. Emergency Fund Coverage (15%) - Months of expenses covered
 * 5. Investment Consistency (20%) - Regular investment behavior
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Expense = require('../models/Expense');
const Goal = require('../models/Goal');
const Investment = require('../models/Investment');
const Budget = require('../models/Budget');

// ========================
// Badge Definitions
// ========================
const BADGES = {
  // Health Score Badges
  HEALTH_ROOKIE: {
    badgeId: 'HEALTH_ROOKIE',
    name: 'Health Starter',
    icon: '💚',
    tier: 'bronze',
    category: 'health',
    requirement: { type: 'health_score', value: 40 }
  },
  HEALTH_WARRIOR: {
    badgeId: 'HEALTH_WARRIOR',
    name: 'Health Warrior',
    icon: '💪',
    tier: 'silver',
    category: 'health',
    requirement: { type: 'health_score', value: 60 }
  },
  HEALTH_CHAMPION: {
    badgeId: 'HEALTH_CHAMPION',
    name: 'Health Champion',
    icon: '🏆',
    tier: 'gold',
    category: 'health',
    requirement: { type: 'health_score', value: 80 }
  },
  HEALTH_LEGEND: {
    badgeId: 'HEALTH_LEGEND',
    name: 'Financial Titan',
    icon: '👑',
    tier: 'diamond',
    category: 'health',
    requirement: { type: 'health_score', value: 95 }
  },

  // Savings Badges
  SAVINGS_SAMURAI: {
    badgeId: 'SAVINGS_SAMURAI',
    name: 'Savings Samurai',
    icon: '⚔️',
    tier: 'gold',
    category: 'savings',
    requirement: { type: 'savings_rate', value: 30 }
  },
  SUPER_SAVER: {
    badgeId: 'SUPER_SAVER',
    name: 'Super Saver',
    icon: '🦸',
    tier: 'platinum',
    category: 'savings',
    requirement: { type: 'savings_rate', value: 50 }
  },

  // Budget Badges
  BUDGET_BOSS: {
    badgeId: 'BUDGET_BOSS',
    name: 'Budget Boss',
    icon: '📊',
    tier: 'gold',
    category: 'budget',
    requirement: { type: 'budget_discipline', value: 85 }
  },
  BUDGET_MASTER: {
    badgeId: 'BUDGET_MASTER',
    name: 'Budget Master',
    icon: '🎯',
    tier: 'platinum',
    category: 'budget',
    requirement: { type: 'budget_discipline', value: 95 }
  },

  // Investment Badges
  INVESTOR_ROOKIE: {
    badgeId: 'INVESTOR_ROOKIE',
    name: 'Investor Rookie',
    icon: '📈',
    tier: 'bronze',
    category: 'investment',
    requirement: { type: 'investment_consistency', value: 40 }
  },
  INVESTMENT_GURU: {
    badgeId: 'INVESTMENT_GURU',
    name: 'Investment Guru',
    icon: '🧙',
    tier: 'gold',
    category: 'investment',
    requirement: { type: 'investment_consistency', value: 80 }
  },

  // Emergency Fund Badges
  SAFETY_NET_STARTER: {
    badgeId: 'SAFETY_NET_STARTER',
    name: 'Safety Net Starter',
    icon: '🛡️',
    tier: 'bronze',
    category: 'savings',
    requirement: { type: 'emergency_fund', value: 3 }
  },
  FORTRESS_BUILDER: {
    badgeId: 'FORTRESS_BUILDER',
    name: 'Fortress Builder',
    icon: '🏰',
    tier: 'gold',
    category: 'savings',
    requirement: { type: 'emergency_fund', value: 6 }
  },

  // Streak Badges
  STREAK_STARTER: {
    badgeId: 'STREAK_STARTER',
    name: 'Streak Starter',
    icon: '🔥',
    tier: 'bronze',
    category: 'streak',
    requirement: { type: 'streak', value: 7 }
  },
  STREAK_MASTER: {
    badgeId: 'STREAK_MASTER',
    name: 'Streak Master',
    icon: '⚡',
    tier: 'silver',
    category: 'streak',
    requirement: { type: 'streak', value: 30 }
  },
  STREAK_LEGEND: {
    badgeId: 'STREAK_LEGEND',
    name: 'Streak Legend',
    icon: '💎',
    tier: 'diamond',
    category: 'streak',
    requirement: { type: 'streak', value: 100 }
  }
};

// Component weights for final score
const SCORE_WEIGHTS = {
  savingsRate: 0.20,
  budgetDiscipline: 0.25,
  debtToIncome: 0.20,
  emergencyFund: 0.15,
  investmentConsistency: 0.20
};

class GamificationService {
  /**
   * Calculate complete Financial Health Score for a user
   * @param {string} userId - User ID
   * @param {string} workspaceId - Optional workspace ID
   * @returns {Object} Complete health score breakdown
   */
  async calculateHealthScore(userId, workspaceId = null) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    // Fetch user with financial profile
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Calculate all 5 components
    const [
      savingsRateData,
      budgetDisciplineData,
      debtToIncomeData,
      emergencyFundData,
      investmentConsistencyData
    ] = await Promise.all([
      this.calculateSavingsRate(userId, workspaceId, threeMonthsAgo),
      this.calculateBudgetDiscipline(userId, workspaceId, threeMonthsAgo),
      this.calculateDebtToIncome(user),
      this.calculateEmergencyFund(userId, user),
      this.calculateInvestmentConsistency(userId, sixMonthsAgo)
    ]);

    // Build components object
    const components = {
      savingsRate: savingsRateData.score,
      budgetDiscipline: budgetDisciplineData.score,
      debtToIncome: debtToIncomeData.score,
      emergencyFund: emergencyFundData.score,
      investmentConsistency: investmentConsistencyData.score
    };

    // Calculate weighted total score
    const totalScore = Math.round(
      components.savingsRate * SCORE_WEIGHTS.savingsRate +
      components.budgetDiscipline * SCORE_WEIGHTS.budgetDiscipline +
      components.debtToIncome * SCORE_WEIGHTS.debtToIncome +
      components.emergencyFund * SCORE_WEIGHTS.emergencyFund +
      components.investmentConsistency * SCORE_WEIGHTS.investmentConsistency
    );

    // Get community comparison
    const communityComparison = await this.getCommunityComparison(totalScore, components);

    // Check and award badges
    const newBadges = await this.checkAndAwardBadges(user, totalScore, components, {
      savingsRateRaw: savingsRateData.rawRate,
      emergencyMonths: emergencyFundData.monthsCovered
    });

    // Update user's health score
    await user.updateHealthScore({
      score: totalScore,
      components: components
    });

    // Update community percentile
    user.healthScore.communityPercentile = communityComparison.percentile;
    await user.save();

    // Generate insights and recommendations
    const insights = this.generateInsights(components, {
      savingsRate: savingsRateData,
      budgetDiscipline: budgetDisciplineData,
      debtToIncome: debtToIncomeData,
      emergencyFund: emergencyFundData,
      investmentConsistency: investmentConsistencyData
    });

    return {
      score: totalScore,
      grade: user.getHealthGrade(totalScore),
      components: {
        savingsRate: {
          score: components.savingsRate,
          weight: SCORE_WEIGHTS.savingsRate * 100,
          details: savingsRateData
        },
        budgetDiscipline: {
          score: components.budgetDiscipline,
          weight: SCORE_WEIGHTS.budgetDiscipline * 100,
          details: budgetDisciplineData
        },
        debtToIncome: {
          score: components.debtToIncome,
          weight: SCORE_WEIGHTS.debtToIncome * 100,
          details: debtToIncomeData
        },
        emergencyFund: {
          score: components.emergencyFund,
          weight: SCORE_WEIGHTS.emergencyFund * 100,
          details: emergencyFundData
        },
        investmentConsistency: {
          score: components.investmentConsistency,
          weight: SCORE_WEIGHTS.investmentConsistency * 100,
          details: investmentConsistencyData
        }
      },
      communityComparison,
      insights,
      newBadges,
      history: user.healthScore.history,
      lastCalculated: new Date()
    };
  }

  /**
   * Calculate Savings Rate Score (0-100)
   * Based on (Income - Expenses) / Income * 100
   */
  async calculateSavingsRate(userId, workspaceId, startDate) {
    const matchQuery = {
      user: new mongoose.Types.ObjectId(userId),
      date: { $gte: startDate }
    };
    if (workspaceId) matchQuery.workspace = new mongoose.Types.ObjectId(workspaceId);

    const aggregation = await Expense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalIncome: {
            $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] }
          },
          totalExpense: {
            $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] }
          }
        }
      }
    ]);

    const data = aggregation[0] || { totalIncome: 0, totalExpense: 0 };
    
    // Calculate savings rate as percentage
    let savingsRate = 0;
    if (data.totalIncome > 0) {
      savingsRate = ((data.totalIncome - data.totalExpense) / data.totalIncome) * 100;
    }

    // Convert to score (0-100)
    // <0% = 0, 0-10% = 0-40, 10-20% = 40-70, 20-30% = 70-85, 30%+ = 85-100
    let score;
    if (savingsRate < 0) {
      score = 0;
    } else if (savingsRate < 10) {
      score = Math.round(savingsRate * 4);
    } else if (savingsRate < 20) {
      score = Math.round(40 + (savingsRate - 10) * 3);
    } else if (savingsRate < 30) {
      score = Math.round(70 + (savingsRate - 20) * 1.5);
    } else {
      score = Math.min(100, Math.round(85 + (savingsRate - 30) * 0.5));
    }

    return {
      score,
      rawRate: Math.round(savingsRate * 10) / 10,
      totalIncome: data.totalIncome,
      totalExpense: data.totalExpense,
      savings: data.totalIncome - data.totalExpense,
      status: savingsRate >= 20 ? 'excellent' : savingsRate >= 10 ? 'good' : savingsRate >= 0 ? 'fair' : 'poor'
    };
  }

  /**
   * Calculate Budget Discipline Score (0-100)
   * Based on adherence to budget limits
   */
  async calculateBudgetDiscipline(userId, workspaceId, startDate) {
    // Get budgets for user
    const budgets = await Budget.find({
      userId: new mongoose.Types.ObjectId(userId),
      isActive: true
    });

    if (budgets.length === 0) {
      // No budgets set - give neutral score but encourage setup
      return {
        score: 50,
        status: 'no_budgets',
        message: 'Set up budgets to improve this score',
        budgetsSet: 0,
        adherenceRate: null
      };
    }

    // Calculate spending per category
    const matchQuery = {
      user: new mongoose.Types.ObjectId(userId),
      type: 'expense',
      date: { $gte: startDate }
    };
    if (workspaceId) matchQuery.workspace = new mongoose.Types.ObjectId(workspaceId);

    const spending = await Expense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' }
        }
      }
    ]);

    const spendingByCategory = {};
    spending.forEach(s => {
      spendingByCategory[s._id] = s.total;
    });

    // Calculate adherence for each budget
    let totalAdherence = 0;
    let budgetCount = 0;
    const budgetDetails = [];

    for (const budget of budgets) {
      const spent = spendingByCategory[budget.category] || 0;
      const limit = budget.amount || 0;
      
      if (limit > 0) {
        const adherence = Math.max(0, (1 - (spent - limit) / limit)) * 100;
        const clampedAdherence = Math.min(100, Math.max(0, adherence));
        totalAdherence += clampedAdherence;
        budgetCount++;
        
        budgetDetails.push({
          category: budget.category,
          limit,
          spent,
          adherence: Math.round(clampedAdherence),
          status: spent <= limit ? 'within' : 'exceeded'
        });
      }
    }

    const averageAdherence = budgetCount > 0 ? totalAdherence / budgetCount : 50;
    const score = Math.round(averageAdherence);

    return {
      score,
      adherenceRate: Math.round(averageAdherence),
      budgetsSet: budgets.length,
      budgetsAnalyzed: budgetCount,
      details: budgetDetails,
      status: score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor'
    };
  }

  /**
   * Calculate Debt-to-Income Score (0-100)
   * Lower DTI = Higher Score
   */
  async calculateDebtToIncome(user) {
    const monthlyIncome = user.financialProfile?.monthlyIncome || 0;
    const monthlyDebt = user.financialProfile?.monthlyDebtPayment || 0;

    if (monthlyIncome === 0) {
      return {
        score: 50,
        ratio: null,
        status: 'no_income_data',
        message: 'Add your income to calculate DTI'
      };
    }

    const dtiRatio = (monthlyDebt / monthlyIncome) * 100;

    // Score inversely related to DTI
    // 0-20% DTI = 100-85, 20-35% = 85-60, 35-50% = 60-30, 50%+ = 30-0
    let score;
    if (dtiRatio <= 20) {
      score = Math.round(100 - dtiRatio * 0.75);
    } else if (dtiRatio <= 35) {
      score = Math.round(85 - (dtiRatio - 20) * 1.67);
    } else if (dtiRatio <= 50) {
      score = Math.round(60 - (dtiRatio - 35) * 2);
    } else {
      score = Math.max(0, Math.round(30 - (dtiRatio - 50) * 0.6));
    }

    return {
      score,
      ratio: Math.round(dtiRatio * 10) / 10,
      monthlyIncome,
      monthlyDebt,
      status: dtiRatio <= 20 ? 'excellent' : dtiRatio <= 35 ? 'good' : dtiRatio <= 50 ? 'fair' : 'poor',
      recommendation: dtiRatio > 35 ? 'Consider reducing debt payments' : null
    };
  }

  /**
   * Calculate Emergency Fund Score (0-100)
   * Based on months of expenses covered
   */
  async calculateEmergencyFund(userId, user) {
    // Get average monthly expenses
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const expenses = await Expense.aggregate([
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
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          total: { $sum: '$amount' }
        }
      }
    ]);

    const monthlyExpenses = expenses.map(e => e.total);
    const avgMonthlyExpense = monthlyExpenses.length > 0 
      ? monthlyExpenses.reduce((a, b) => a + b, 0) / monthlyExpenses.length 
      : 0;

    const emergencyFund = user.financialProfile?.emergencyFundCurrent || 0;
    
    // Calculate months covered
    const monthsCovered = avgMonthlyExpense > 0 ? emergencyFund / avgMonthlyExpense : 0;

    // Score: 0 months = 0, 1 month = 25, 3 months = 60, 6 months = 90, 12+ months = 100
    let score;
    if (monthsCovered >= 12) {
      score = 100;
    } else if (monthsCovered >= 6) {
      score = Math.round(90 + (monthsCovered - 6) * 1.67);
    } else if (monthsCovered >= 3) {
      score = Math.round(60 + (monthsCovered - 3) * 10);
    } else if (monthsCovered >= 1) {
      score = Math.round(25 + (monthsCovered - 1) * 17.5);
    } else {
      score = Math.round(monthsCovered * 25);
    }

    return {
      score,
      monthsCovered: Math.round(monthsCovered * 10) / 10,
      emergencyFund,
      avgMonthlyExpense: Math.round(avgMonthlyExpense),
      status: monthsCovered >= 6 ? 'excellent' : monthsCovered >= 3 ? 'good' : monthsCovered >= 1 ? 'fair' : 'poor',
      recommendation: monthsCovered < 3 ? 'Build 3-6 months emergency fund' : null
    };
  }

  /**
   * Calculate Investment Consistency Score (0-100)
   * Based on regular investment behavior
   */
  async calculateInvestmentConsistency(userId, startDate) {
    // Get investment transactions
    const investments = await Investment.find({
      user: new mongoose.Types.ObjectId(userId)
    }).sort({ createdAt: -1 });

    if (investments.length === 0) {
      return {
        score: 30, // Base score for no investments
        status: 'no_investments',
        message: 'Start investing to improve this score',
        portfolioValue: 0,
        investmentCount: 0
      };
    }

    // Calculate metrics
    const portfolioValue = investments.reduce((sum, inv) => {
      return sum + (inv.quantity * (inv.currentPrice || inv.buyPrice));
    }, 0);

    // Check for diversity
    const investmentTypes = new Set(investments.map(i => i.type));
    const diversityScore = Math.min(100, investmentTypes.size * 25);

    // Check for regular additions (simplified - based on count and recency)
    const recentInvestments = investments.filter(i => i.createdAt >= startDate);
    const regularityScore = Math.min(100, recentInvestments.length * 15);

    // Get goal progress for investment goals
    const investmentGoals = await Goal.find({
      user: new mongoose.Types.ObjectId(userId),
      goalType: { $in: ['savings', 'emergency_fund'] },
      status: 'active'
    });

    let goalProgressScore = 50;
    if (investmentGoals.length > 0) {
      const avgProgress = investmentGoals.reduce((sum, g) => sum + g.progress, 0) / investmentGoals.length;
      goalProgressScore = Math.round(avgProgress);
    }

    // Combined score
    const score = Math.round(
      diversityScore * 0.3 +
      regularityScore * 0.4 +
      goalProgressScore * 0.3
    );

    return {
      score,
      portfolioValue: Math.round(portfolioValue),
      investmentCount: investments.length,
      diversificationScore: diversityScore,
      regularityScore,
      goalProgressScore,
      assetTypes: Array.from(investmentTypes),
      status: score >= 70 ? 'excellent' : score >= 50 ? 'good' : score >= 30 ? 'fair' : 'poor'
    };
  }

  /**
   * Get community comparison statistics
   */
  async getCommunityComparison(userScore, userComponents) {
    // Get all users' health scores for percentile calculation
    const allScores = await User.aggregate([
      {
        $match: {
          'healthScore.currentScore': { $exists: true, $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          scores: { $push: '$healthScore.currentScore' },
          avgSavingsRate: { $avg: '$healthScore.components.savingsRate' },
          avgBudgetDiscipline: { $avg: '$healthScore.components.budgetDiscipline' },
          avgDebtToIncome: { $avg: '$healthScore.components.debtToIncome' },
          avgEmergencyFund: { $avg: '$healthScore.components.emergencyFund' },
          avgInvestmentConsistency: { $avg: '$healthScore.components.investmentConsistency' },
          count: { $sum: 1 }
        }
      }
    ]);

    const data = allScores[0] || {
      scores: [50],
      avgSavingsRate: 50,
      avgBudgetDiscipline: 50,
      avgDebtToIncome: 50,
      avgEmergencyFund: 50,
      avgInvestmentConsistency: 50,
      count: 1
    };

    // Calculate percentile
    const sortedScores = data.scores.sort((a, b) => a - b);
    const rank = sortedScores.filter(s => s < userScore).length;
    const percentile = Math.round((rank / sortedScores.length) * 100);

    // Calculate comparison messages
    const comparisons = [];
    
    if (userComponents.savingsRate > (data.avgSavingsRate || 50)) {
      const diff = Math.round(userComponents.savingsRate - data.avgSavingsRate);
      comparisons.push({
        component: 'Savings Rate',
        message: `You're ${diff}% higher than average!`,
        positive: true
      });
    }

    if (userComponents.budgetDiscipline > (data.avgBudgetDiscipline || 50)) {
      const diff = Math.round(userComponents.budgetDiscipline - data.avgBudgetDiscipline);
      comparisons.push({
        component: 'Budget Discipline',
        message: `${diff}% better than most users`,
        positive: true
      });
    }

    if (userComponents.investmentConsistency > (data.avgInvestmentConsistency || 50)) {
      comparisons.push({
        component: 'Investment',
        message: 'More consistent than average investor',
        positive: true
      });
    }

    return {
      percentile,
      rank: `Top ${100 - percentile}%`,
      totalUsers: data.count,
      averages: {
        savingsRate: Math.round(data.avgSavingsRate || 50),
        budgetDiscipline: Math.round(data.avgBudgetDiscipline || 50),
        debtToIncome: Math.round(data.avgDebtToIncome || 50),
        emergencyFund: Math.round(data.avgEmergencyFund || 50),
        investmentConsistency: Math.round(data.avgInvestmentConsistency || 50)
      },
      comparisons
    };
  }

  /**
   * Check and award badges based on metrics
   */
  async checkAndAwardBadges(user, score, components, rawMetrics) {
    const newBadges = [];

    // Health Score badges
    if (score >= 40 && !user.badges.find(b => b.badgeId === 'HEALTH_ROOKIE')) {
      const result = await user.awardBadge(BADGES.HEALTH_ROOKIE);
      if (result.awarded) newBadges.push(result.badge);
    }
    if (score >= 60 && !user.badges.find(b => b.badgeId === 'HEALTH_WARRIOR')) {
      const result = await user.awardBadge(BADGES.HEALTH_WARRIOR);
      if (result.awarded) newBadges.push(result.badge);
    }
    if (score >= 80 && !user.badges.find(b => b.badgeId === 'HEALTH_CHAMPION')) {
      const result = await user.awardBadge(BADGES.HEALTH_CHAMPION);
      if (result.awarded) newBadges.push(result.badge);
    }
    if (score >= 95 && !user.badges.find(b => b.badgeId === 'HEALTH_LEGEND')) {
      const result = await user.awardBadge(BADGES.HEALTH_LEGEND);
      if (result.awarded) newBadges.push(result.badge);
    }

    // Savings badges
    if (rawMetrics.savingsRateRaw >= 30 && !user.badges.find(b => b.badgeId === 'SAVINGS_SAMURAI')) {
      const result = await user.awardBadge(BADGES.SAVINGS_SAMURAI);
      if (result.awarded) newBadges.push(result.badge);
    }
    if (rawMetrics.savingsRateRaw >= 50 && !user.badges.find(b => b.badgeId === 'SUPER_SAVER')) {
      const result = await user.awardBadge(BADGES.SUPER_SAVER);
      if (result.awarded) newBadges.push(result.badge);
    }

    // Budget badges
    if (components.budgetDiscipline >= 85 && !user.badges.find(b => b.badgeId === 'BUDGET_BOSS')) {
      const result = await user.awardBadge(BADGES.BUDGET_BOSS);
      if (result.awarded) newBadges.push(result.badge);
    }
    if (components.budgetDiscipline >= 95 && !user.badges.find(b => b.badgeId === 'BUDGET_MASTER')) {
      const result = await user.awardBadge(BADGES.BUDGET_MASTER);
      if (result.awarded) newBadges.push(result.badge);
    }

    // Investment badges
    if (components.investmentConsistency >= 40 && !user.badges.find(b => b.badgeId === 'INVESTOR_ROOKIE')) {
      const result = await user.awardBadge(BADGES.INVESTOR_ROOKIE);
      if (result.awarded) newBadges.push(result.badge);
    }
    if (components.investmentConsistency >= 80 && !user.badges.find(b => b.badgeId === 'INVESTMENT_GURU')) {
      const result = await user.awardBadge(BADGES.INVESTMENT_GURU);
      if (result.awarded) newBadges.push(result.badge);
    }

    // Emergency Fund badges
    if (rawMetrics.emergencyMonths >= 3 && !user.badges.find(b => b.badgeId === 'SAFETY_NET_STARTER')) {
      const result = await user.awardBadge(BADGES.SAFETY_NET_STARTER);
      if (result.awarded) newBadges.push(result.badge);
    }
    if (rawMetrics.emergencyMonths >= 6 && !user.badges.find(b => b.badgeId === 'FORTRESS_BUILDER')) {
      const result = await user.awardBadge(BADGES.FORTRESS_BUILDER);
      if (result.awarded) newBadges.push(result.badge);
    }

    // Streak badges
    const streak = user.gamification?.streakDays || 0;
    if (streak >= 7 && !user.badges.find(b => b.badgeId === 'STREAK_STARTER')) {
      const result = await user.awardBadge(BADGES.STREAK_STARTER);
      if (result.awarded) newBadges.push(result.badge);
    }
    if (streak >= 30 && !user.badges.find(b => b.badgeId === 'STREAK_MASTER')) {
      const result = await user.awardBadge(BADGES.STREAK_MASTER);
      if (result.awarded) newBadges.push(result.badge);
    }
    if (streak >= 100 && !user.badges.find(b => b.badgeId === 'STREAK_LEGEND')) {
      const result = await user.awardBadge(BADGES.STREAK_LEGEND);
      if (result.awarded) newBadges.push(result.badge);
    }

    return newBadges;
  }

  /**
   * Generate personalized insights and recommendations
   */
  generateInsights(components, details) {
    const insights = [];
    const strengths = [];
    const improvements = [];

    // Savings Rate insights
    if (details.savingsRate.score >= 70) {
      strengths.push({
        component: 'Savings Rate',
        message: `Excellent! You're saving ${details.savingsRate.rawRate}% of your income.`,
        icon: '💰'
      });
    } else if (details.savingsRate.score < 40) {
      improvements.push({
        component: 'Savings Rate',
        message: `Try to increase savings rate to at least 20%. Currently: ${details.savingsRate.rawRate}%`,
        priority: 'high',
        icon: '📉'
      });
    }

    // Budget Discipline insights
    if (details.budgetDiscipline.status === 'no_budgets') {
      improvements.push({
        component: 'Budget',
        message: 'Set up category budgets to track spending better',
        priority: 'medium',
        icon: '📊'
      });
    } else if (details.budgetDiscipline.score >= 85) {
      strengths.push({
        component: 'Budget Discipline',
        message: 'Great job staying within your budgets!',
        icon: '🎯'
      });
    } else if (details.budgetDiscipline.score < 50) {
      improvements.push({
        component: 'Budget Discipline',
        message: 'Review exceeded categories and adjust spending or budgets',
        priority: 'high',
        icon: '⚠️'
      });
    }

    // Debt-to-Income insights
    if (details.debtToIncome.ratio && details.debtToIncome.ratio > 35) {
      improvements.push({
        component: 'Debt-to-Income',
        message: `Your DTI ratio (${details.debtToIncome.ratio}%) is high. Consider debt payoff strategies.`,
        priority: 'high',
        icon: '💳'
      });
    } else if (details.debtToIncome.ratio && details.debtToIncome.ratio <= 20) {
      strengths.push({
        component: 'Debt-to-Income',
        message: 'Excellent debt management with low DTI ratio!',
        icon: '✅'
      });
    }

    // Emergency Fund insights
    if (details.emergencyFund.monthsCovered < 3) {
      improvements.push({
        component: 'Emergency Fund',
        message: `Build up to 3-6 months of expenses. Current: ${details.emergencyFund.monthsCovered} months`,
        priority: 'high',
        icon: '🛡️'
      });
    } else if (details.emergencyFund.monthsCovered >= 6) {
      strengths.push({
        component: 'Emergency Fund',
        message: `Solid safety net with ${details.emergencyFund.monthsCovered} months covered!`,
        icon: '🏰'
      });
    }

    // Investment insights
    if (details.investmentConsistency.status === 'no_investments') {
      improvements.push({
        component: 'Investments',
        message: 'Consider starting to invest for long-term wealth building',
        priority: 'medium',
        icon: '📈'
      });
    } else if (details.investmentConsistency.diversificationScore < 50) {
      improvements.push({
        component: 'Investment Diversity',
        message: 'Diversify your portfolio across different asset types',
        priority: 'low',
        icon: '🎲'
      });
    }

    return {
      strengths,
      improvements: improvements.sort((a, b) => {
        const priority = { high: 3, medium: 2, low: 1 };
        return priority[b.priority] - priority[a.priority];
      }),
      quickWins: improvements.filter(i => i.priority === 'low').slice(0, 2)
    };
  }

  /**
   * Get user's gamification profile
   */
  async getUserGamificationProfile(userId) {
    const user = await User.findById(userId).select(
      'gamification badges healthScore name'
    );

    if (!user) throw new Error('User not found');

    return {
      level: user.gamification.level,
      levelName: user.gamification.levelName,
      totalPoints: user.gamification.totalPoints,
      currentLevelXp: user.gamification.currentLevelXp,
      xpToNextLevel: user.gamification.xpToNextLevel,
      streakDays: user.gamification.streakDays,
      badges: user.badges,
      badgeCount: user.badges.length,
      healthScore: user.healthScore.currentScore,
      healthGrade: user.healthScore.grade,
      communityPercentile: user.healthScore.communityPercentile
    };
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(limit = 10, type = 'points') {
    const sortField = type === 'health' 
      ? 'healthScore.currentScore' 
      : 'gamification.totalPoints';

    const leaderboard = await User.find({})
      .select('name gamification.totalPoints gamification.level healthScore.currentScore healthScore.grade badges')
      .sort({ [sortField]: -1 })
      .limit(limit);

    return leaderboard.map((user, index) => ({
      rank: index + 1,
      name: user.name,
      points: user.gamification.totalPoints,
      level: user.gamification.level,
      healthScore: user.healthScore.currentScore,
      healthGrade: user.healthScore.grade,
      badgeCount: user.badges.length
    }));
  }

  /**
   * Get all available badges with user progress
   */
  async getAllBadges(userId) {
    const user = await User.findById(userId);
    const earnedBadgeIds = new Set(user.badges.map(b => b.badgeId));

    return Object.values(BADGES).map(badge => ({
      ...badge,
      earned: earnedBadgeIds.has(badge.badgeId),
      earnedAt: user.badges.find(b => b.badgeId === badge.badgeId)?.earnedAt
    }));
  }

  /**
   * Update user's financial profile
   */
  async updateFinancialProfile(userId, profileData) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    user.financialProfile = {
      ...user.financialProfile,
      ...profileData
    };

    await user.save();
    return user.financialProfile;
  }

  /**
   * Daily score calculation job (for cron)
   */
  async runDailyScoreCalculation() {
    const users = await User.find({}).select('_id');
    const results = { success: 0, failed: 0 };

    for (const user of users) {
      try {
        await this.calculateHealthScore(user._id);
        results.success++;
      } catch (error) {
        console.error(`Failed to calculate score for user ${user._id}:`, error);
        results.failed++;
      }
    }

    return results;
  }
}

module.exports = new GamificationService();
