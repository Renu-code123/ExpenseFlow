/**
 * Goals Analytics Routes
 * 
 * API endpoints for predictive analytics and goal forecasting
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const predictiveEngine = require('../services/goals-predictive-engine');
const logger = require('../utils/logger');

/**
 * @route   GET /api/goals/analytics
 * @desc    Get predictive analytics for all active goals
 * @access  Private
 */
router.get('/analytics', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    
    logger.info(`Fetching goals analytics for user: ${userId}`);
    
    const analytics = await predictiveEngine.getGoalsAnalytics(userId);
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Error fetching goals analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch goals analytics',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/goals/analytics/velocity
 * @desc    Get savings velocity metrics
 * @access  Private
 */
router.get('/analytics/velocity', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const monthsBack = parseInt(req.query.months) || 6;
    
    logger.info(`Calculating savings velocity for user: ${userId}, months: ${monthsBack}`);
    
    const velocity = await predictiveEngine.calculateSavingsVelocity(userId, monthsBack);
    
    res.json({
      success: true,
      data: velocity
    });
  } catch (error) {
    logger.error('Error calculating savings velocity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate savings velocity',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/goals/analytics/:goalId/forecast
 * @desc    Get forecast for a specific goal
 * @access  Private
 */
router.get('/analytics/:goalId/forecast', authenticate, async (req, res) => {
  try {
    const { goalId } = req.params;
    const userId = req.user._id;
    
    logger.info(`Fetching forecast for goal: ${goalId}, user: ${userId}`);
    
    const forecast = await predictiveEngine.getGoalForecast(goalId, userId);
    
    res.json({
      success: true,
      data: forecast
    });
  } catch (error) {
    logger.error('Error fetching goal forecast:', error);
    
    if (error.message === 'Goal not found') {
      return res.status(404).json({
        success: false,
        error: 'Goal not found',
        message: 'The specified goal does not exist or you do not have access to it'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch goal forecast',
      message: error.message
    });
  }
});

/**
 * @route   POST /api/goals/analytics/simulate
 * @desc    Simulate goal completion with different savings scenarios
 * @access  Private
 */
router.post('/analytics/simulate', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const { goalId, monthlySavingsRate } = req.body;
    
    if (!goalId || !monthlySavingsRate || monthlySavingsRate <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters',
        message: 'Goal ID and positive monthly savings rate are required'
      });
    }
    
    logger.info(`Simulating goal completion for goal: ${goalId}, rate: ${monthlySavingsRate}`);
    
    // Get the goal
    const Goal = require('../models/Goal');
    const goal = await Goal.findOne({ _id: goalId, user: userId });
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        error: 'Goal not found'
      });
    }
    
    // Create simulated velocity
    const simulatedVelocity = {
      hasEnoughData: true,
      monthlySavingsRate: parseFloat(monthlySavingsRate),
      confidence: 0.7, // Lower confidence for simulated data
      trend: { direction: 'stable', strength: 0 }
    };
    
    const forecast = predictiveEngine.generateGoalForecast(goal, simulatedVelocity);
    
    res.json({
      success: true,
      data: {
        goal: {
          id: goal._id,
          title: goal.title,
          targetAmount: goal.targetAmount,
          currentAmount: goal.currentAmount
        },
        simulatedForecast: forecast,
        scenario: {
          monthlySavingsRate: monthlySavingsRate,
          description: `Saving ${monthlySavingsRate} per month`
        }
      }
    });
  } catch (error) {
    logger.error('Error simulating goal completion:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to simulate goal completion',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/goals/analytics/summary
 * @desc    Get quick summary of goals health
 * @access  Private
 */
router.get('/analytics/summary', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    
    logger.info(`Fetching goals summary for user: ${userId}`);
    
    const analytics = await predictiveEngine.getGoalsAnalytics(userId);
    
    // Return just the summary and key metrics
    res.json({
      success: true,
      data: {
        summary: analytics.summary,
        velocity: {
          hasEnoughData: analytics.velocity.hasEnoughData,
          monthlySavingsRate: analytics.velocity.monthlySavingsRate,
          confidence: analytics.velocity.confidence,
          trend: analytics.velocity.trend
        },
        atRiskGoals: analytics.goals.filter(g => !g.onTrack && !g.isCompleted).map(g => ({
          goalId: g.goalId,
          title: g.title,
          probabilityOfSuccess: g.probabilityOfSuccess,
          behindByDays: g.behindByDays
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching goals summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch goals summary',
      message: error.message
    });
  }
});

module.exports = router;
