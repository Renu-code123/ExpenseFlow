const express = require('express');
const router = express.Router();
const SearchIndex = require('../models/SearchIndex');
const auth = require('../middleware/auth');
const ResponseFactory = require('../utils/ResponseFactory');
const { searchCache } = require('../middleware/searchCache');

/**
 * Advanced Search API
 * Issue #720: Multi-faceted, semantic search using the SearchIndex denormalized store.
 */

/**
 * @route   GET /api/search
 * @desc    Search transactions with multiple facets and full-text
 * @access  Private
 */
router.get('/', auth, searchCache, async (req, res) => {
    try {
        const {
            q,
            minAmount,
            maxAmount,
            category,
            merchant,
            tags,
            sentiment,
            businessType,
            isRecurring,
            startDate,
            endDate,
            workspaceId
        } = req.query;

        // 1. Build Query Object
        const query = { userId: req.user._id };

        // Full-Text Search
        if (q) {
            query.$text = { $search: q };
        }

        // Numeric Range (Amount)
        if (minAmount || maxAmount) {
            query.amount = {};
            if (minAmount) query.amount.$gte = parseFloat(minAmount);
            if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
        }

        // Date Range
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        // Discrete Facets
        if (category) query.category = category;
        if (merchant) query.merchant = { $regex: merchant, $options: 'i' };
        if (sentiment) query.sentiment = sentiment;
        if (businessType) query.businessType = businessType;
        if (workspaceId) query.workspaceId = workspaceId;
        if (isRecurring !== undefined) query.isRecurring = isRecurring === 'true';

        // Tag matching (matches if transaction has ANY of the provided tags)
        if (tags) {
            const tagList = tags.split(',');
            query.tags = { $in: tagList };
        }

        // 2. Execute Search
        const results = await SearchIndex.find(query)
            .sort(q ? { score: { $meta: 'textScore' } } : { date: -1 })
            .limit(100);

        // 3. Return results
        return ResponseFactory.success(res, {
            count: results.length,
            results: results
        });

    } catch (err) {
        console.error('[SearchRoute] Failure:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/search/suggestions
 * @desc    Get autocomplete suggestions for merchants or categories
 */
router.get('/suggestions', auth, async (req, res) => {
    const { field, q } = req.query;
    if (!field || !q) return res.status(400).json({ error: 'Field and query required' });

    try {
        const suggestions = await SearchIndex.distinct(field, {
            userId: req.user._id,
            [field]: { $regex: q, $options: 'i' }
        });

        res.json({ success: true, suggestions: suggestions.slice(0, 10) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
