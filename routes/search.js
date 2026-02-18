const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const searchService = require('../services/searchService');
const { cacheMiddleware } = require('../middleware/cache');

/**
 * @route   GET /api/search/smart
 * @desc    Get transactions using smart query parsing and facets
 * @access  Private
 */
router.get('/smart', auth, cacheMiddleware, async (req, res) => {
    try {
        const { q, page, limit } = req.query;

        if (!q) {
            return res.status(400).json({ error: 'Search query (q) is required' });
        }

        const results = await searchService.search(req.user._id, q, { page, limit });
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   GET /api/search/merchants
 * @desc    Suggest merchants based on partial name (fuzzy)
 * @access  Private
 */
router.get('/merchants', auth, async (req, res) => {
    try {
        const { name } = req.query;
        const suggestions = await searchService.findSimilarMerchants(req.user._id, name);
        res.json({ success: true, data: suggestions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
