const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { body, query, validationResult } = require('express-validator');
const advancedAnalyticsService = require('../services/advancedAnalyticsService');
const gamificationService = require('../services/scoreService');
const discoveryService = require('../services/discoveryService');
const forecastingService = require('../services/forecastingService');
const intelligenceService = require('../services/intelligenceService');
const DataWarehouse = require('../models/DataWarehouse');
const CustomDashboard = require('../models/CustomDashboard');
const FinancialHealthScore = require('../models/FinancialHealthScore');
const Budget = require('../models/Budget');

// ========================
// SUBSCRIPTION DETECTION & RUNWAY ROUTES (Issue #444)
// ========================

/**
 * GET /api/analytics/subscriptions/discover
 * Scan past transactions to detect subscription patterns
 */
router.get('/subscriptions/discover', auth, async (req, res) => {
  try {
    const discoveries = await discoveryService.discoverSubscriptions(req.user.id);

    res.json({
      success: true,
      data: discoveries
    });
  } catch (error) {
    console.error('Subscription discovery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scan for subscriptions'
    });
  }
});

/**
 * POST /api/analytics/subscriptions/confirm
 * Confirm detected subscription and add to recurring expenses
 */
router.post('/subscriptions/confirm', auth, [
  body('merchantKey').notEmpty().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Get current discoveries
    const discoveries = await discoveryService.discoverSubscriptions(req.user.id);
    const detection = discoveries.detected.find(d => d.merchantKey === req.body.merchantKey);

    if (!detection) {
      return res.status(404).json({
        success: false,
        message: 'Detection not found or already confirmed'
      });
    }

    const recurring = await discoveryService.confirmSubscription(req.user.id, detection);

    res.json({
      success: true,
      message: 'Subscription confirmed and tracked',
      data: recurring
    });
  } catch (error) {
    console.error('Confirm subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm subscription'
    });
  }
});

/**
 * POST /api/analytics/subscriptions/confirm-multiple
 * Confirm multiple detected subscriptions at once
 */
router.post('/subscriptions/confirm-multiple', auth, [
  body('merchantKeys').isArray({ min: 1 }),
  body('merchantKeys.*').isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const discoveries = await discoveryService.discoverSubscriptions(req.user.id);
    const results = await discoveryService.confirmMultiple(
      req.user.id,
      req.body.merchantKeys,
      discoveries.detected
    );

    res.json({
      success: true,
      message: `Confirmed ${results.confirmed.length} subscriptions`,
      data: results
    });
  } catch (error) {
    console.error('Confirm multiple subscriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm subscriptions'
    });
  }
});

/**
 * GET /api/analytics/subscriptions/burn-rate
 * Get subscription burn rate calculation
 */
router.get('/subscriptions/burn-rate', auth, async (req, res) => {
  try {
    const burnRate = await discoveryService.calculateBurnRate(req.user.id);

    res.json({
      success: true,
      data: burnRate
    });
  } catch (error) {
    console.error('Get burn rate error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate burn rate'
    });
  }
});

/**
 * GET /api/analytics/subscriptions/upcoming
 * Get upcoming subscription charges
 */
router.get('/subscriptions/upcoming', auth, [
  query('days').optional().isInt({ min: 1, max: 90 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const days = parseInt(req.query.days) || 30;
    const upcoming = await discoveryService.getUpcomingCharges(req.user.id, days);

    res.json({
      success: true,
      data: upcoming
    });
  } catch (error) {
    console.error('Get upcoming charges error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get upcoming charges'
    });
  }
});

/**
 * GET /api/analytics/runway
 * Get financial runway calculation
 */
router.get('/runway', auth, async (req, res) => {
  try {
    const runway = await forecastingService.calculateRunway(req.user.id);

    res.json({
      success: true,
      data: runway
    });
  } catch (error) {
    console.error('Get runway error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate runway'
    });
  }
});

/**
 * GET /api/analytics/runway/summary
 * Get runway summary for dashboard
 */
router.get('/runway/summary', auth, async (req, res) => {
  try {
    const summary = await forecastingService.getRunwaySummary(req.user.id);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get runway summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get runway summary'
    });
  }
});

// ========================
// Gamification & Health Score Routes (Issue #421)
// ========================

/**
 * GET /api/analytics/gamification/health-score
 * Calculate and return complete Financial Health Score
 */
router.get('/gamification/health-score', auth, [
  query('workspaceId').optional().isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const healthScore = await gamificationService.calculateHealthScore(
      req.user.id,
      req.query.workspaceId
    );

    res.json({
      success: true,
      data: healthScore
    });
  } catch (error) {
    console.error('Get gamification health score error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate financial health score'
    });
  }
});

/**
 * GET /api/analytics/gamification/profile
 * Get user's gamification profile (level, XP, badges)
 */
router.get('/gamification/profile', auth, async (req, res) => {
  try {
    const profile = await gamificationService.getUserGamificationProfile(req.user.id);

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Get gamification profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get gamification profile'
    });
  }
});

/**
 * GET /api/analytics/gamification/badges
 * Get all available badges with user's progress
 */
router.get('/gamification/badges', auth, async (req, res) => {
  try {
    const badges = await gamificationService.getAllBadges(req.user.id);

    res.json({
      success: true,
      data: badges
    });
  } catch (error) {
    console.error('Get badges error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get badges'
    });
  }
});

/**
 * GET /api/analytics/gamification/leaderboard
 * Get community leaderboard
 */
router.get('/gamification/leaderboard', auth, [
  query('limit').optional().isInt({ min: 5, max: 50 }),
  query('type').optional().isIn(['points', 'health'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const limit = parseInt(req.query.limit) || 10;
    const type = req.query.type || 'points';

    const leaderboard = await gamificationService.getLeaderboard(limit, type);

    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get leaderboard'
    });
  }
});

/**
 * PUT /api/analytics/gamification/financial-profile
 * Update user's financial profile for score calculation
 */
router.put('/gamification/financial-profile', auth, [
  body('monthlyIncome').optional().isFloat({ min: 0 }),
  body('monthlyDebtPayment').optional().isFloat({ min: 0 }),
  body('emergencyFundTarget').optional().isFloat({ min: 0 }),
  body('emergencyFundCurrent').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const profile = await gamificationService.updateFinancialProfile(req.user.id, req.body);

    res.json({
      success: true,
      message: 'Financial profile updated',
      data: profile
    });
  } catch (error) {
    console.error('Update financial profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update financial profile'
    });
  }
});

/**
 * POST /api/analytics/gamification/recalculate
 * Force recalculation of health score
 */
router.post('/gamification/recalculate', auth, [
  body('workspaceId').optional().isMongoId()
], async (req, res) => {
  try {
    const healthScore = await gamificationService.calculateHealthScore(
      req.user.id,
      req.body.workspaceId
    );

    res.json({
      success: true,
      message: 'Health score recalculated',
      data: healthScore
    });
  } catch (error) {
    console.error('Recalculate health score error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate health score'
    });
  }
});

// ========================
// Existing Analytics Routes
// ========================

// Get data warehouse analytics
router.get('/warehouse', auth, [
  query('workspaceId').optional().isMongoId(),
  query('granularity').optional().isIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('metrics').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      workspaceId,
      granularity = 'monthly',
      startDate,
      endDate,
      metrics
    } = req.query;

    const query = {
      userId: req.user.id,
      granularity
    };

    if (workspaceId) query.workspaceId = workspaceId;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    let projection = {};
    if (metrics) {
      const requestedMetrics = metrics.split(',');
      requestedMetrics.forEach(metric => {
        projection[`metrics.${metric}`] = 1;
        projection[`trends.${metric}`] = 1;
        projection[`kpis.${metric}`] = 1;
      });
      projection.period = 1;
      projection.granularity = 1;
    }

    const data = await DataWarehouse.find(query, projection);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get spending trends
router.get('/trends', auth, async (req, res) => {
    try {
        const { period = 'daily', timeRange = 30 } = req.query;
        const userId = req.user.id;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(timeRange));
        
        const expenses = await Expense.aggregate([
            {
                $match: {
                    userId: userId,
                    date: { $gte: startDate },
                    type: 'expense'
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: period === 'monthly' ? '%Y-%m' : '%Y-%m-%d',
                            date: '$date'
                        }
                    },
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id': 1 } }
        ]);
        
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get category breakdown
router.get('/categories', auth, async (req, res) => {
    try {
        const { timeRange = 30 } = req.query;
        const userId = req.user.id;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(timeRange));
        
        const categoryData = await Expense.aggregate([
            {
                $match: {
                    userId: userId,
                    date: { $gte: startDate },
                    type: 'expense'
                }
            },
            {
                $group: {
                    _id: '$category',
                    totalAmount: { $sum: '$amount' },
                    transactionCount: { $sum: 1 },
                    avgAmount: { $avg: '$amount' }
                }
            },
            { $sort: { totalAmount: -1 } }
        ]);
        
        const totalExpenses = categoryData.reduce((sum, cat) => sum + cat.totalAmount, 0);
        
        const categoriesWithPercentage = categoryData.map(cat => ({
            category: cat._id,
            amount: cat.totalAmount,
            transactions: cat.transactionCount,
            percentage: ((cat.totalAmount / totalExpenses) * 100).toFixed(1),
            avgPerTransaction: Math.round(cat.avgAmount)
        }));
        
        res.json(categoriesWithPercentage);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get top merchants
router.get('/merchants', auth, async (req, res) => {
    try {
        const { timeRange = 30, limit = 10 } = req.query;
        const userId = req.user.id;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(timeRange));
        
        const merchants = await Expense.aggregate([
            {
                $match: {
                    userId: userId,
                    date: { $gte: startDate },
                    type: 'expense',
                    merchant: { $exists: true, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$merchant',
                    totalAmount: { $sum: '$amount' },
                    transactionCount: { $sum: 1 }
                }
            },
            { $sort: { totalAmount: -1 } },
            { $limit: parseInt(limit) }
        ]);
        
        res.json(merchants.map(merchant => ({
            name: merchant._id,
            amount: merchant.totalAmount,
            transactions: merchant.transactionCount
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get income vs expenses comparison
router.get('/income-expense', auth, async (req, res) => {
    try {
        const { months = 6 } = req.query;
        const userId = req.user.id;
        
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - parseInt(months));
        
        const monthlyData = await Expense.aggregate([
            {
                $match: {
                    userId: userId,
                    date: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $dateToString: { format: '%Y-%m', date: '$date' } },
                        type: '$type'
                    },
                    totalAmount: { $sum: '$amount' }
                }
            },
            { $sort: { '_id.month': 1 } }
        ]);
        
        const formattedData = {};
        monthlyData.forEach(item => {
            const month = item._id.month;
            if (!formattedData[month]) {
                formattedData[month] = { month, income: 0, expense: 0 };
            }
            formattedData[month][item._id.type] = item.totalAmount;
        });
        
        res.json(Object.values(formattedData));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Generate detailed report
router.get('/report/:type', auth, async (req, res) => {
    try {
        const { type } = req.params;
        const { timeRange = 30 } = req.query;
        const userId = req.user.id;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(timeRange));
        
        let reportData = [];
        
        switch (type) {
            case 'category':
                reportData = await Expense.aggregate([
                    {
                        $match: {
                            userId: userId,
                            date: { $gte: startDate },
                            type: 'expense'
                        }
                    },
                    {
                        $group: {
                            _id: '$category',
                            totalAmount: { $sum: '$amount' },
                            transactionCount: { $sum: 1 },
                            avgAmount: { $avg: '$amount' }
                        }
                    },
                    { $sort: { totalAmount: -1 } }
                ]);
                break;
                
            case 'monthly':
                reportData = await Expense.aggregate([
                    {
                        $match: {
                            userId: userId,
                            type: 'expense'
                        }
                    },
                    {
                        $group: {
                            _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
                            totalAmount: { $sum: '$amount' },
                            transactionCount: { $sum: 1 }
                        }
                    },
                    { $sort: { '_id': -1 } },
                    { $limit: 12 }
                ]);
                break;
                
            case 'yearly':
                reportData = await Expense.aggregate([
                    {
                        $match: {
                            userId: userId,
                            type: 'expense'
                        }
                    },
                    {
                        $group: {
                            _id: { $dateToString: { format: '%Y', date: '$date' } },
                            totalAmount: { $sum: '$amount' },
                            transactionCount: { $sum: 1 }
                        }
                    },
                    { $sort: { '_id': -1 } },
                    { $limit: 5 }
                ]);
                break;
        }
        
        res.json(reportData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get financial insights
router.get('/insights', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const insights = [];
        
        // Weekend vs weekday spending
        const weekendSpending = await Expense.aggregate([
            {
                $match: {
                    userId: userId,
                    type: 'expense',
                    date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: { $dayOfWeek: '$date' },
                    avgAmount: { $avg: '$amount' }
                }
            }
        ]);
        
        const weekdayAvg = weekendSpending
            .filter(day => day._id >= 2 && day._id <= 6)
            .reduce((sum, day) => sum + day.avgAmount, 0) / 5;
        const weekendAvg = weekendSpending
            .filter(day => day._id === 1 || day._id === 7)
            .reduce((sum, day) => sum + day.avgAmount, 0) / 2;
        
        if (weekendAvg > weekdayAvg * 1.2) {
            insights.push({
                type: 'spending_pattern',
                title: 'Weekend Spending',
                message: `You spend ${Math.round(((weekendAvg / weekdayAvg - 1) * 100))}% more on weekends. Consider setting weekend budgets.`,
                icon: '🎯'
            });
        }
        
        // Budget performance (mock for now)
        insights.push({
            type: 'budget_performance',
            title: 'Budget Performance',
            message: 'You\'re 15% under budget this month. Great job on controlling expenses!',
            icon: '📊'
        });
        
        // Savings opportunity
        const foodExpenses = await Expense.aggregate([
            {
                $match: {
                    userId: userId,
                    category: 'Food & Dining',
                    type: 'expense',
                    date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' }
                }
            }
        ]);
        
        if (foodExpenses.length > 0) {
            const monthlySavings = Math.round(foodExpenses[0].totalAmount * 0.2);
            insights.push({
                type: 'savings_opportunity',
                title: 'Savings Opportunity',
                message: `Reduce food delivery by 20% to save ₹${monthlySavings} monthly.`,
                icon: '💰'
            });
        }
        
        res.json(insights);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// AI-DRIVEN BUDGET INTELLIGENCE ROUTES
// Z-Score Anomaly Detection & Self-Healing
// ============================================

// Get Z-Score based anomaly analysis
router.get('/intelligence/anomalies', auth, [
  query('months').optional().isInt({ min: 1, max: 12 }),
  query('threshold').optional().isFloat({ min: 1, max: 4 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { months = 6, threshold = 2.0 } = req.query;

    const anomalies = await analyticsService.getZScoreAnomalies(req.user.id, {
      months: parseInt(months),
      threshold: parseFloat(threshold)
    });

    res.json({
      success: true,
      data: anomalies
    });
  } catch (error) {
    console.error('Get anomalies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get anomaly analysis'
    });
  }
});

// Get spending volatility analysis
router.get('/intelligence/volatility', auth, [
  query('months').optional().isInt({ min: 1, max: 12 })
], async (req, res) => {
  try {
    const { months = 6 } = req.query;

    const volatility = await analyticsService.getVolatilityAnalysis(req.user.id, {
      months: parseInt(months)
    });

    res.json({
      success: true,
      data: volatility
    });
  } catch (error) {
    console.error('Get volatility error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get volatility analysis'
    });
  }
});

// Get comprehensive intelligence dashboard
router.get('/intelligence/dashboard', auth, async (req, res) => {
  try {
    const dashboard = await budgetIntelligenceService.getIntelligenceDashboard(req.user.id);

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    console.error('Get intelligence dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get intelligence dashboard'
    });
  }
});

// Update budget intelligence statistics
router.post('/intelligence/update', auth, async (req, res) => {
  try {
    // Sync spending history first
    await budgetIntelligenceService.syncSpendingHistory(req.user.id);
    
    // Update intelligence
    const result = await budgetIntelligenceService.updateBudgetIntelligence(req.user.id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Update intelligence error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update budget intelligence'
    });
  }
});

// Analyze a specific transaction for anomaly
router.post('/intelligence/analyze-transaction', auth, [
  body('amount').isFloat({ min: 0.01 }),
  body('category').notEmpty().isString(),
  body('description').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount, category, description } = req.body;

    const analysis = await budgetIntelligenceService.analyzeTransaction(req.user.id, {
      amount: parseFloat(amount),
      category,
      description: description || 'Manual analysis'
    });

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Analyze transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze transaction'
    });
  }
});

// Get reallocation suggestions
router.get('/intelligence/reallocations', auth, async (req, res) => {
  try {
    const budgets = await Budget.find({ 
      user: req.user.id, 
      isActive: true 
    });

    const suggestions = [];
    
    for (const budget of budgets) {
      const pending = budget.intelligence.reallocations.filter(r => r.status === 'pending');
      pending.forEach(suggestion => {
        suggestions.push({
          ...suggestion,
          fromBudgetId: budget._id,
          fromCategory: budget.category,
          fromBudgetName: budget.name,
          fromBudgetSurplus: budget.surplus
        });
      });
    }

    // Sort by suggested amount (highest first)
    suggestions.sort((a, b) => b.suggestedAmount - a.suggestedAmount);

    res.json({
      success: true,
      data: {
        suggestions,
        totalPending: suggestions.length
      }
    });
  } catch (error) {
    console.error('Get reallocations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reallocation suggestions'
    });
  }
});

// Generate reallocation suggestions for a specific deficit
router.post('/intelligence/reallocations/generate', auth, [
  body('category').notEmpty().isString(),
  body('deficitAmount').isFloat({ min: 0.01 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { category, deficitAmount } = req.body;

    const suggestions = await budgetIntelligenceService.generateReallocationSuggestions(
      req.user.id,
      category,
      parseFloat(deficitAmount)
    );

    res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    console.error('Generate reallocations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate reallocation suggestions'
    });
  }
});

// Apply a reallocation (move funds between budgets)
router.post('/intelligence/reallocations/apply', auth, [
  body('fromBudgetId').isMongoId(),
  body('toBudgetId').isMongoId(),
  body('amount').isFloat({ min: 0.01 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { fromBudgetId, toBudgetId, amount } = req.body;

    const result = await budgetIntelligenceService.applyReallocation(
      req.user.id,
      fromBudgetId,
      toBudgetId,
      parseFloat(amount)
    );

    res.json({
      success: true,
      data: result,
      message: 'Funds reallocated successfully'
    });
  } catch (error) {
    console.error('Apply reallocation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to apply reallocation'
    });
  }
});

// Reject a reallocation suggestion
router.post('/intelligence/reallocations/reject', auth, [
  body('budgetId').isMongoId(),
  body('toCategory').notEmpty().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { budgetId, toCategory } = req.body;

    const budget = await Budget.findOne({
      _id: budgetId,
      user: req.user.id
    });

    if (!budget) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found'
      });
    }

    const suggestion = budget.intelligence.reallocations.find(
      r => r.toCategory === toCategory && r.status === 'pending'
    );

    if (suggestion) {
      suggestion.status = 'rejected';
      await budget.save();
    }

    res.json({
      success: true,
      message: 'Reallocation suggestion rejected'
    });
  } catch (error) {
    console.error('Reject reallocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject reallocation'
    });
  }
});

// Batch analyze recent transactions for anomalies
router.post('/intelligence/batch-analyze', auth, [
  body('since').optional().isISO8601()
], async (req, res) => {
  try {
    const { since } = req.body;

    const results = await budgetIntelligenceService.batchAnalyzeTransactions(
      req.user.id,
      since ? new Date(since) : null
    );

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Batch analyze error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to batch analyze transactions'
    });
  }
});

// Get budgets with intelligence data
router.get('/intelligence/budgets', auth, async (req, res) => {
  try {
    const budgets = await budgetService.getBudgetsWithIntelligence(req.user.id);

    res.json({
      success: true,
      data: budgets
    });
  } catch (error) {
    console.error('Get budgets with intelligence error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get budgets with intelligence'
    });
  }
});

// Get budget alerts including AI-driven alerts
router.get('/intelligence/alerts', auth, async (req, res) => {
  try {
    const alerts = await budgetService.checkBudgetAlerts(req.user.id);

    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get budget alerts'
    });
  }
});

// Recalculate all budgets and update intelligence
router.post('/intelligence/recalculate', auth, async (req, res) => {
  try {
    const result = await budgetService.recalculateBudgets(req.user.id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Recalculate error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate budgets'
    });
  }
});

// ========================
// PREDICTIVE BURN RATE INTELLIGENCE ROUTES (Issue #470)
// ========================

/**
 * GET /api/analytics/burn-rate
 * Calculate daily/weekly spending velocity (burn rate)
 */
router.get('/burn-rate', auth, async (req, res) => {
  try {
    const { categoryId, workspaceId, startDate, endDate } = req.query;
    
    const burnRate = await intelligenceService.calculateBurnRate(req.user.id, {
      categoryId,
      workspaceId,
      startDate,
      endDate
    });
    
    res.json({
      success: true,
      data: burnRate
    });
  } catch (error) {
    console.error('Burn rate calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate burn rate'
    });
  }
});

/**
 * GET /api/analytics/forecast
 * Predict future expenses using linear regression
 */
router.get('/forecast', auth, async (req, res) => {
  try {
    const { categoryId, workspaceId, daysToPredict } = req.query;
    
    const forecast = await intelligenceService.predictExpenses(req.user.id, {
      categoryId,
      workspaceId,
      daysToPredict: daysToPredict ? parseInt(daysToPredict) : 30
    });
    
    res.json({
      success: true,
      data: forecast
    });
  } catch (error) {
    console.error('Forecast error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate forecast'
    });
  }
});

/**
 * GET /api/analytics/forecast/moving-average
 * Calculate weighted moving average for smoother predictions
 */
router.get('/forecast/moving-average', auth, async (req, res) => {
  try {
    const { categoryId, workspaceId, period } = req.query;
    
    const wma = await intelligenceService.calculateWeightedMovingAverage(req.user.id, {
      categoryId,
      workspaceId,
      period: period ? parseInt(period) : 7
    });
    
    res.json({
      success: true,
      data: wma
    });
  } catch (error) {
    console.error('Moving average error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate moving average'
    });
  }
});

/**
 * GET /api/analytics/budget/:budgetId/exhaustion
 * Predict when a budget will be exhausted based on burn rate
 */
router.get('/budget/:budgetId/exhaustion', auth, async (req, res) => {
  try {
    const { budgetId } = req.params;
    
    const exhaustion = await intelligenceService.predictBudgetExhaustion(req.user.id, budgetId);
    
    res.json({
      success: true,
      data: exhaustion
    });
  } catch (error) {
    console.error('Budget exhaustion prediction error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to predict budget exhaustion'
    });
  }
});

/**
 * GET /api/analytics/category-patterns
 * Analyze spending patterns by category with predictions
 */
router.get('/category-patterns', auth, async (req, res) => {
  try {
    const { workspaceId, daysToAnalyze } = req.query;
    
    const patterns = await intelligenceService.analyzeCategoryPatterns(req.user.id, {
      workspaceId,
      daysToAnalyze: daysToAnalyze ? parseInt(daysToAnalyze) : 30
    });
    
    res.json({
      success: true,
      data: patterns
    });
  } catch (error) {
    console.error('Category patterns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze category patterns'
    });
  }
});

/**
 * GET /api/analytics/insights
 * Generate intelligent insights and recommendations
 */
router.get('/insights', auth, async (req, res) => {
  try {
    const insights = await intelligenceService.generateInsights(req.user.id);
    
    res.json({
      success: true,
      data: insights
    });
  } catch (error) {
    console.error('Generate insights error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate insights'
    });
  }
});

/**
 * GET /api/analytics/forecast/complete
 * Get complete forecast data including predictions, burn rate, and category analysis
 */
router.get('/forecast/complete', auth, async (req, res) => {
  try {
    const { categoryId, workspaceId } = req.query;
    
    // Run all analyses in parallel
    const [burnRate, forecast, categoryPatterns, insights] = await Promise.all([
      intelligenceService.calculateBurnRate(req.user.id, { categoryId, workspaceId }),
      intelligenceService.predictExpenses(req.user.id, { categoryId, workspaceId, daysToPredict: 30 }),
      intelligenceService.analyzeCategoryPatterns(req.user.id, { workspaceId }),
      intelligenceService.generateInsights(req.user.id)
    ]);
    
    res.json({
      success: true,
      data: {
        burnRate,
        forecast,
        categoryPatterns,
        insights,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Complete forecast error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate complete forecast'
    });
  }
});

// ========================
// FINANCIAL WELLNESS & HEALTH SCORE ROUTES (Issue #481)
// ========================

const wellnessService = require('../services/wellnessService');
const analysisEngine = require('../services/analysisEngine');
const Insight = require('../models/Insight');

/**
 * GET /api/analytics/wellness/health-score
 * Get comprehensive financial health score
 */
router.get('/wellness/health-score', auth, async (req, res) => {
  try {
    const timeWindow = parseInt(req.query.timeWindow) || 30;
    const healthScore = await wellnessService.calculateHealthScore(req.user.id, { timeWindow });

    res.json({
      success: true,
      data: healthScore
    });
  } catch (error) {
    console.error('Health score calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate health score'
    });
  }
});

/**
 * GET /api/analytics/wellness/insights
 * Get active financial insights and recommendations
 */
router.get('/wellness/insights', auth, async (req, res) => {
  try {
    const priority = req.query.priority;
    const type = req.query.type;
    const limit = parseInt(req.query.limit) || 20;

    const insights = await Insight.getActiveInsights(req.user.id, {
      priority,
      type,
      limit
    });

    const statistics = await Insight.getStatistics(req.user.id);

    res.json({
      success: true,
      data: {
        insights,
        statistics,
        count: insights.length
      }
    });
  } catch (error) {
    console.error('Insights fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch insights'
    });
  }
});

/**
 * POST /api/analytics/wellness/analyze
 * Run comprehensive financial analysis
 */
router.post('/wellness/analyze', auth, async (req, res) => {
  try {
    const analysis = await analysisEngine.runComprehensiveAnalysis(req.user.id);

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run analysis'
    });
  }
});

/**
 * POST /api/analytics/wellness/insights/:id/acknowledge
 * Acknowledge an insight
 */
router.post('/wellness/insights/:id/acknowledge', auth, async (req, res) => {
  try {
    const insight = await Insight.findOne({ 
      _id: req.params.id, 
      user: req.user.id 
    });

    if (!insight) {
      return res.status(404).json({
        success: false,
        message: 'Insight not found'
      });
    }

    await insight.acknowledge();

    res.json({
      success: true,
      message: 'Insight acknowledged',
      data: insight
    });
  } catch (error) {
    console.error('Acknowledge insight error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to acknowledge insight'
    });
  }
});

/**
 * POST /api/analytics/wellness/insights/:id/dismiss
 * Dismiss an insight
 */
router.post('/wellness/insights/:id/dismiss', auth, async (req, res) => {
  try {
    const insight = await Insight.findOne({ 
      _id: req.params.id, 
      user: req.user.id 
    });

    if (!insight) {
      return res.status(404).json({
        success: false,
        message: 'Insight not found'
      });
    }

    await insight.dismiss();

    res.json({
      success: true,
      message: 'Insight dismissed',
      data: insight
    });
  } catch (error) {
    console.error('Dismiss insight error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to dismiss insight'
    });
  }
});

/**
 * GET /api/analytics/wellness/velocity/:category
 * Get spending velocity analysis for specific category
 */
router.get('/wellness/velocity/:category', auth, async (req, res) => {
  try {
    const timeWindow = parseInt(req.query.timeWindow) || 7;
    const velocity = await analysisEngine.analyzeSpendingVelocity(req.user.id, {
      category: req.params.category,
      timeWindow
    });

    res.json({
      success: true,
      data: velocity
    });
  } catch (error) {
    console.error('Velocity analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze velocity'
    });
  }
});

module.exports = router;