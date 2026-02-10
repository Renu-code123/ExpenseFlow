const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const categorizationService = require('../services/categorizationService');
const CategoryPattern = require('../models/CategoryPattern');
const {
    validateSuggestCategory,
    validateTrainCategory,
    validateBulkCategorize,
    validatePatternId
} = require('../middleware/categorizationValidator');

/**
 * @route   GET /api/categorization/suggest
 * @desc    Get category suggestions for a description
 * @access  Private
 */
router.get('/suggest', auth, validateSuggestCategory, async (req, res) => {
    try {
        const { description } = req.query;
        
        const result = await categorizationService.suggestCategory(req.user._id, description);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Suggest category error:', error);
        res.status(500).json({
            success: false,
            message: 'Error suggesting category',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/categorization/train
 * @desc    Train the system with user correction
 * @access  Private
 */
router.post('/train', auth, validateTrainCategory, async (req, res) => {
    try {
        const { description, suggestedCategory, actualCategory } = req.body;
        
        const result = await categorizationService.trainFromCorrection(
            req.user._id,
            description,
            suggestedCategory,
            actualCategory
        );
        
        res.json({
            success: true,
            message: result.message,
            data: result
        });
    } catch (error) {
        console.error('Train category error:', error);
        res.status(500).json({
            success: false,
            message: 'Error training categorization',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/categorization/bulk
 * @desc    Bulk categorize multiple expenses
 * @access  Private
 */
router.post('/bulk', auth, validateBulkCategorize, async (req, res) => {
    try {
        const { expenses } = req.body;
        
        const results = await categorizationService.bulkCategorize(req.user._id, expenses);
        
        res.json({
            success: true,
            message: `Categorized ${results.length} expenses`,
            data: results
        });
    } catch (error) {
        console.error('Bulk categorize error:', error);
        res.status(500).json({
            success: false,
            message: 'Error bulk categorizing',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/categorization/patterns
 * @desc    Get user's learned patterns
 * @access  Private
 */
router.get('/patterns', auth, async (req, res) => {
    try {
        const { category, minConfidence = 0 } = req.query;
        
        const query = {
            user: req.user._id,
            isActive: true
        };
        
        if (category) {
            query.category = category;
        }
        
        if (minConfidence) {
            query.confidence = { $gte: parseFloat(minConfidence) };
        }
        
        const patterns = await CategoryPattern.find(query)
            .sort({ confidence: -1, usageCount: -1 })
            .limit(50);
        
        res.json({
            success: true,
            count: patterns.length,
            data: patterns
        });
    } catch (error) {
        console.error('Get patterns error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching patterns',
            error: error.message
        });
    }
});

/**
 * @route   DELETE /api/categorization/patterns/:patternId
 * @desc    Delete a specific pattern
 * @access  Private
 */
router.delete('/patterns/:patternId', auth, validatePatternId, async (req, res) => {
    try {
        const { patternId } = req.params;
        
        const pattern = await CategoryPattern.findOne({
            _id: patternId,
            user: req.user._id
        });
        
        if (!pattern) {
            return res.status(404).json({
                success: false,
                message: 'Pattern not found'
            });
        }
        
        // Soft delete by marking as inactive
        pattern.isActive = false;
        await pattern.save();
        
        res.json({
            success: true,
            message: 'Pattern deleted successfully'
        });
    } catch (error) {
        console.error('Delete pattern error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting pattern',
            error: error.message
        });
    }
});

/**
 * @route   DELETE /api/categorization/patterns
 * @desc    Delete all patterns for a category or all patterns
 * @access  Private
 */
router.delete('/patterns', auth, async (req, res) => {
    try {
        const { category } = req.query;
        
        const query = {
            user: req.user._id
        };
        
        if (category) {
            query.category = category;
        }
        
        const result = await CategoryPattern.updateMany(
            query,
            { $set: { isActive: false } }
        );
        
        res.json({
            success: true,
            message: `Deleted ${result.modifiedCount} patterns`,
            count: result.modifiedCount
        });
    } catch (error) {
        console.error('Delete patterns error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting patterns',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/categorization/stats
 * @desc    Get user's categorization statistics
 * @access  Private
 */
router.get('/stats', auth, async (req, res) => {
    try {
        const stats = await categorizationService.getUserStats(req.user._id);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/categorization/analytics
 * @desc    Get user's categorization analytics
 * @access  Private
 */
router.get('/analytics', auth, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const CategoryAnalytics = require('../models/CategoryAnalytics');

        const analytics = await CategoryAnalytics.getUserAnalytics(req.user._id, parseInt(days));

        res.json({
            success: true,
            data: analytics
        });
    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching analytics',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/categorization/record-prediction
 * @desc    Record a prediction result for analytics
 * @access  Private
 */
router.post('/record-prediction', auth, async (req, res) => {
    try {
        const { prediction, actualCategory, confidence } = req.body;
        const CategoryAnalytics = require('../models/CategoryAnalytics');

        const analytics = await CategoryAnalytics.recordPrediction(
            req.user._id,
            prediction,
            actualCategory,
            confidence
        );

        res.json({
            success: true,
            message: 'Prediction recorded',
            data: analytics
        });
    } catch (error) {
        console.error('Record prediction error:', error);
        res.status(500).json({
            success: false,
            message: 'Error recording prediction',
            error: error.message
        });
    }
});

module.exports = router;
