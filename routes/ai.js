const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { body, query, validationResult } = require('express-validator');
const aiService = require('../services/aiService');
const AIPrediction = require('../models/AIPrediction');
const AITrainingData = require('../models/AITrainingData');
const {requireAuth,getUserId}=require('../middleware/clerkAuth');

// Predict expense category
router.post('/predict/category',requireAuth, [
  body('description').notEmpty().isString().trim().isLength({ max: 200 }),
  body('amount').isNumeric().isFloat({ min: 0.01 }),
  body('merchant').optional().isString().trim().isLength({ max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { description, amount, merchant } = req.body;
    const prediction = await aiService.predictExpenseCategory(
      req.user.id, description, amount, merchant || ''
    );

    if (!prediction) {
      return res.status(503).json({
        success: false,
        message: 'AI service unavailable'
      });
    }

    res.json({
      success: true,
      data: prediction
    });
  } catch (error) {
    console.error('Category prediction error:', error);
    res.status(500).json({
      success: false,
      message: 'Prediction failed'
    });
  }
});

// Detect fraud/anomalies
router.post('/detect/fraud',requireAuth, [
  body('expense').isObject().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const fraudAnalysis = await aiService.detectFraud(req.user.id, req.body.expense);

    if (!fraudAnalysis) {
      return res.status(503).json({
        success: false,
        message: 'Fraud detection service unavailable'
      });
    }

    res.json({
      success: true,
      data: fraudAnalysis
    });
  } catch (error) {
    console.error('Fraud detection error:', error);
    res.status(500).json({
      success: false,
      message: 'Fraud detection failed'
    });
  }
});

// Cash flow prediction
router.get('/predict/cashflow',requireAuth, [
  query('days').optional().isInt({ min: 1, max: 365 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const days = parseInt(req.query.days) || 30;
    const prediction = await aiService.predictCashFlow(req.user.id, days);

    if (!prediction) {
      return res.status(503).json({
        success: false,
        message: 'Cash flow prediction service unavailable'
      });
    }

    res.json({
      success: true,
      data: prediction
    });
  } catch (error) {
    console.error('Cash flow prediction error:', error);
    res.status(500).json({
      success: false,
      message: 'Cash flow prediction failed'
    });
  }
});

// Get AI recommendations
router.get('/recommendations',requireAuth, async (req, res) => {
  try {
    const recommendations = await aiService.generateRecommendations(req.user.id);

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate recommendations'
    });
  }
});

// Add training data
router.post('/training/add',requireAuth, [
  body('modelType').isIn(['category_classifier', 'fraud_detector', 'cash_flow_predictor', 'anomaly_detector']),
  body('features').isArray().notEmpty(),
  body('label').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const trainingData = await AITrainingData.create({
      userId: req.user.id,
      ...req.body
    });

    res.status(201).json({
      success: true,
      data: trainingData
    });
  } catch (error) {
    console.error('Training data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add training data'
    });
  }
});

// Validate prediction
router.post('/predictions/:id/validate', requireAuth, [
  body('actualOutcome').notEmpty(),
  body('isCorrect').isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const prediction = await AIPrediction.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      {
        actualOutcome: req.body.actualOutcome,
        isVerified: true,
        accuracy: req.body.isCorrect ? 1 : 0
      },
      { new: true }
    );

    if (!prediction) {
      return res.status(404).json({
        success: false,
        message: 'Prediction not found'
      });
    }

    res.json({
      success: true,
      data: prediction
    });
  } catch (error) {
    console.error('Prediction validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate prediction'
    });
  }
});

// Get prediction history
router.get('/predictions', requireAuth, [
  query('type').optional().isIn(['category_prediction', 'cash_flow_forecast', 'anomaly_detection', 'spending_pattern']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { userId: req.user.id };
    if (req.query.type) {
      filter.type = req.query.type;
    }

    const [predictions, total] = await Promise.all([
      AIPrediction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AIPrediction.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        predictions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Prediction history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get prediction history'
    });
  }
});

// Get AI analytics
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const [
      totalPredictions,
      accuracyStats,
      typeBreakdown,
      recentPredictions
    ] = await Promise.all([
      AIPrediction.countDocuments({ userId: req.user.id }),
      AIPrediction.aggregate([
        { $match: { userId: req.user.id, isVerified: true } },
        {
          $group: {
            _id: '$type',
            avgAccuracy: { $avg: '$accuracy' },
            avgConfidence: { $avg: '$confidence' },
            count: { $sum: 1 }
          }
        }
      ]),
      AIPrediction.aggregate([
        { $match: { userId: req.user.id } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        }
      ]),
      AIPrediction.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('type prediction confidence createdAt')
    ]);

    res.json({
      success: true,
      data: {
        totalPredictions,
        accuracyStats,
        typeBreakdown,
        recentPredictions
      }
    });
  } catch (error) {
    console.error('AI analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get AI analytics'
    });
  }
});

// Train model (admin only)
router.post('/train/:modelType', requireAuth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { modelType } = req.params;
    
    if (modelType === 'category_classifier') {
      await aiService.trainCategoryModel(req.user.id);
    }

    res.json({
      success: true,
      message: `${modelType} training initiated`
    });
  } catch (error) {
    console.error('Model training error:', error);
    res.status(500).json({
      success: false,
      message: 'Model training failed'
    });
  }
});

module.exports = router;