const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const indexingEngine = require('../services/indexingEngine');
const searchRepository = require('../repositories/searchRepository');
const searchIntelligence = require('../services/searchIntelligence');
const { searchCache } = require('../middleware/searchCache');
const { 
    attachSemanticContext, 
    validateSemanticParams,
    injectRAGContext 
} = require('../middleware/semanticContext');
const ResponseFactory = require('../utils/responseFactory');

/**
 * Global Search Routes
 * Issue #756: Federated search endpoints across multiple entities.
 * Issue #796: Semantic search and RAG-aware intelligence endpoints.
 */

/**
 * @route   GET /api/search
 * @desc    Universal search across indexed entities
 */
router.get('/', auth, searchCache, async (req, res) => {
    try {
        const { q, workspaceId, limit, offset } = req.query;

        if (!q) {
            return ResponseFactory.error(res, 400, 'Search query required');
        }

        const results = await indexingEngine.search(q, req.user._id, workspaceId, {
            limit: parseInt(limit) || 20,
            offset: parseInt(offset) || 0
        });

        return ResponseFactory.success(res, {
            query: q,
            count: results.length,
            results
        });
    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   GET /api/search/semantic
 * @desc    Issue #796: Natural language semantic search with vector proximity
 */
router.get('/semantic', auth, validateSemanticParams, async (req, res) => {
    try {
        const { 
            q, 
            workspaceId, 
            limit, 
            minSimilarity,
            entityTypes,
            includeContext,
            dateFrom,
            dateTo,
            amountMin,
            amountMax,
            categories 
        } = req.query;

        if (!q) {
            return ResponseFactory.error(res, 400, 'Search query required');
        }

        // Build options
        const options = {
            userId: req.user._id,
            workspaceId,
            limit: parseInt(limit) || 20,
            minSimilarity: parseFloat(minSimilarity) || 0.3,
            includeContext: includeContext !== 'false'
        };

        // Parse entity types
        if (entityTypes) {
            options.entityTypes = Array.isArray(entityTypes) 
                ? entityTypes 
                : entityTypes.split(',').map(t => t.trim().toUpperCase());
        }

        // Parse date range
        if (dateFrom || dateTo) {
            options.dateRange = {
                start: dateFrom ? new Date(dateFrom) : new Date(0),
                end: dateTo ? new Date(dateTo) : new Date()
            };
        }

        // Parse amount range
        if (amountMin || amountMax) {
            options.amountRange = {
                min: parseFloat(amountMin) || 0,
                max: parseFloat(amountMax) || Infinity
            };
        }

        // Parse categories
        if (categories) {
            options.categories = Array.isArray(categories) 
                ? categories 
                : categories.split(',').map(c => c.trim());
        }

        const results = await searchIntelligence.semanticSearch(q, options);

        // Record search for analytics
        await searchRepository.recordSearch(q, req.user._id, workspaceId, results.results.length);

        return ResponseFactory.success(res, {
            query: q,
            intent: results.intent,
            count: results.results.length,
            totalCandidates: results.totalCandidates,
            results: results.results,
            ragContext: options.includeContext ? results.ragContext : undefined
        });

    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   GET /api/search/hybrid
 * @desc    Issue #796: Hybrid search combining keyword and semantic approaches
 */
router.get('/hybrid', auth, validateSemanticParams, async (req, res) => {
    try {
        const { 
            q, 
            workspaceId, 
            limit, 
            offset,
            mode,
            sortBy,
            entityTypes,
            dateFrom,
            dateTo,
            amountMin,
            amountMax,
            categories,
            merchants
        } = req.query;

        if (!q) {
            return ResponseFactory.error(res, 400, 'Search query required');
        }

        const options = {
            userId: req.user._id,
            workspaceId,
            limit: parseInt(limit) || 20,
            offset: parseInt(offset) || 0,
            mode: mode || 'hybrid',
            sortBy: sortBy || 'relevance'
        };

        // Parse entity types
        if (entityTypes) {
            options.entityTypes = Array.isArray(entityTypes) 
                ? entityTypes 
                : entityTypes.split(',').map(t => t.trim().toUpperCase());
        }

        // Parse date range
        if (dateFrom || dateTo) {
            options.dateRange = {
                start: dateFrom ? new Date(dateFrom) : new Date(0),
                end: dateTo ? new Date(dateTo) : new Date()
            };
        }

        // Parse amount range
        if (amountMin || amountMax) {
            options.amountRange = {
                min: parseFloat(amountMin) || 0,
                max: parseFloat(amountMax) || Infinity
            };
        }

        // Parse categories and merchants
        if (categories) {
            options.categories = typeof categories === 'string' 
                ? categories.split(',').map(c => c.trim()) 
                : categories;
        }
        if (merchants) {
            options.merchants = typeof merchants === 'string' 
                ? merchants.split(',').map(m => m.trim()) 
                : merchants;
        }

        const results = await searchRepository.hybridSearch(q, options);

        return ResponseFactory.success(res, results);

    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   GET /api/search/nlq
 * @desc    Issue #796: Natural language query with RAG context for AI responses
 */
router.get('/nlq', auth, injectRAGContext, async (req, res) => {
    try {
        const { q, workspaceId, limit } = req.query;

        if (!q) {
            return ResponseFactory.error(res, 400, 'Query required');
        }

        const results = await searchRepository.naturalLanguageSearch(q, {
            userId: req.user._id,
            workspaceId,
            limit: parseInt(limit) || 10,
            includeRAGContext: true
        });

        return ResponseFactory.success(res, {
            query: q,
            intent: results.intent,
            results: results.results,
            ragContext: results.ragContext
        });

    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   GET /api/search/suggestions
 * @desc    Issue #796: Get search suggestions based on partial query
 */
router.get('/suggestions', auth, async (req, res) => {
    try {
        const { q, workspaceId, limit } = req.query;

        if (!q || q.length < 2) {
            return ResponseFactory.success(res, { suggestions: [] });
        }

        const suggestions = await searchRepository.getSuggestions(q, {
            userId: req.user._id,
            workspaceId,
            limit: parseInt(limit) || 5
        });

        return ResponseFactory.success(res, { suggestions });

    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   GET /api/search/similar/:entityId
 * @desc    Issue #796: Find similar entities using semantic similarity
 */
router.get('/similar/:entityId', auth, async (req, res) => {
    try {
        const { entityId } = req.params;
        const { workspaceId, limit, minSimilarity } = req.query;

        const similarEntities = await searchRepository.findSimilar(entityId, {
            userId: req.user._id,
            workspaceId,
            limit: parseInt(limit) || 10,
            minSimilarity: parseFloat(minSimilarity) || 0.5
        });

        return ResponseFactory.success(res, {
            sourceEntityId: entityId,
            count: similarEntities.length,
            similar: similarEntities
        });

    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   GET /api/search/aggregate
 * @desc    Issue #796: Aggregate search results by category/merchant
 */
router.get('/aggregate', auth, async (req, res) => {
    try {
        const { q, workspaceId, groupBy } = req.query;

        if (!q) {
            return ResponseFactory.error(res, 400, 'Search query required');
        }

        const aggregation = await searchRepository.aggregateResults(q, {
            userId: req.user._id,
            workspaceId,
            groupBy: groupBy || 'category'
        });

        return ResponseFactory.success(res, aggregation);

    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   GET /api/search/temporal
 * @desc    Issue #796: Search with temporal understanding
 */
router.get('/temporal', auth, async (req, res) => {
    try {
        const { q, timeframe, workspaceId, limit, offset } = req.query;

        if (!q) {
            return ResponseFactory.error(res, 400, 'Search query required');
        }

        const results = await searchRepository.temporalSearch(
            q,
            timeframe || 'this month',
            {
                userId: req.user._id,
                workspaceId,
                limit: parseInt(limit) || 20,
                offset: parseInt(offset) || 0
            }
        );

        return ResponseFactory.success(res, results);

    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   POST /api/search/feedback
 * @desc    Issue #796: Submit feedback for search result quality improvement
 */
router.post('/feedback', auth, async (req, res) => {
    try {
        const { entityId, queryText, relevanceScore, clicked } = req.body;

        if (!entityId) {
            return ResponseFactory.error(res, 400, 'Entity ID required');
        }

        await searchIntelligence.processFeedback(
            entityId,
            req.user._id,
            queryText,
            relevanceScore || 0,
            clicked || false
        );

        return ResponseFactory.success(res, { message: 'Feedback recorded' });

    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   GET /api/search/stats
 * @desc    Issue #796: Get search index statistics
 */
router.get('/stats', auth, async (req, res) => {
    try {
        const { workspaceId } = req.query;

        const stats = await searchRepository.getSearchStats(req.user._id, workspaceId);

        return ResponseFactory.success(res, stats);

    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

/**
 * @route   POST /api/search/reindex
 * @desc    Manually trigger reindexing for a user (Admin/Utility)
 */
router.post('/reindex', auth, async (req, res) => {
    // Hidden internal utility to force refresh
    // Implementation would iterate over Transactions and re-index
    return ResponseFactory.success(res, { message: 'Reindexing triggered in background' });
});

/**
 * @route   GET /api/search/indexing-status
 * @desc    Issue #796: Get current indexing engine status
 */
router.get('/indexing-status', auth, async (req, res) => {
    try {
        const status = indexingEngine.getStatus();
        return ResponseFactory.success(res, status);
    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

module.exports = router;
