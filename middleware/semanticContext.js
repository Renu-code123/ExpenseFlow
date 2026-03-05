const searchIntelligence = require('../services/searchIntelligence');
const logger = require('../utils/structuredLogger');

/**
 * Semantic Context Middleware
 * Issue #796: Injecting semantic proximity results into standard API responses.
 * Enhances API responses with contextually relevant information from semantic search.
 */

/**
 * Configuration for semantic enrichment
 */
const DEFAULT_CONFIG = {
    enabled: true,
    minContextRelevance: 0.3,
    maxContextItems: 5,
    entityTypes: ['TRANSACTION', 'NOTE', 'MERCHANT', 'BUDGET'],
    enrichmentFields: ['relatedItems', 'semanticContext', 'suggestions'],
    cacheTTL: 300000 // 5 minutes
};

/**
 * In-memory cache for semantic context
 */
const contextCache = new Map();
const CACHE_MAX_SIZE = 500;

/**
 * Create semantic context middleware
 * @param {Object} config - Configuration options
 */
function createSemanticContextMiddleware(config = {}) {
    const options = { ...DEFAULT_CONFIG, ...config };

    return async (req, res, next) => {
        if (!options.enabled) {
            return next();
        }

        // Store original json method
        const originalJson = res.json.bind(res);

        // Override json method to inject semantic context
        res.json = async function(data) {
            try {
                // Skip enrichment for error responses
                if (data?.error || res.statusCode >= 400) {
                    return originalJson(data);
                }

                // Skip if no user context
                if (!req.user?._id) {
                    return originalJson(data);
                }

                // Determine if response should be enriched
                const shouldEnrich = _shouldEnrichResponse(req, data, options);
                
                if (!shouldEnrich) {
                    return originalJson(data);
                }

                // Enrich response with semantic context
                const enrichedData = await _enrichResponse(req, data, options);
                
                return originalJson(enrichedData);

            } catch (error) {
                logger.warn('[SemanticContext] Enrichment failed, returning original', {
                    error: error.message,
                    path: req.path
                });
                return originalJson(data);
            }
        };

        next();
    };
}

/**
 * Determine if response should be enriched with semantic context
 */
function _shouldEnrichResponse(req, data, options) {
    // Only enrich GET requests by default
    if (req.method !== 'GET') {
        return false;
    }

    // Skip certain paths
    const skipPaths = ['/health', '/status', '/auth', '/login', '/logout'];
    if (skipPaths.some(p => req.path.includes(p))) {
        return false;
    }

    // Check for explicit opt-out header
    if (req.headers['x-skip-semantic-enrichment'] === 'true') {
        return false;
    }

    // Check for explicit opt-in query param
    if (req.query.semanticContext === 'false') {
        return false;
    }

    // Enrich if response contains enrichable data
    return _hasEnrichableData(data);
}

/**
 * Check if response data can be enriched
 */
function _hasEnrichableData(data) {
    if (!data) return false;
    
    // Check for transaction-like data
    if (data.expenses || data.transactions || data.expense || data.transaction) {
        return true;
    }
    
    // Check for budget data
    if (data.budgets || data.budget || data.goals) {
        return true;
    }

    // Check for search results
    if (data.results && Array.isArray(data.results)) {
        return true;
    }

    // Check for single entity with description
    if (data.description || data.merchant || data.category) {
        return true;
    }

    return false;
}

/**
 * Enrich response with semantic context
 */
async function _enrichResponse(req, data, options) {
    const userId = req.user._id;
    const workspaceId = req.query.workspaceId || req.params.workspaceId || req.body?.workspaceId;

    // Extract context text from response
    const contextText = _extractContextText(data);
    
    if (!contextText) {
        return data;
    }

    // Check cache
    const cacheKey = _generateCacheKey(userId, workspaceId, contextText);
    let cached = null;

if (contextCache.has(cacheKey)) {
    cached = contextCache.get(cacheKey);

    // If expired, delete it
    if (Date.now() - cached.timestamp >= options.cacheTTL) {
        contextCache.delete(cacheKey);
        cached = null;
    } else {
        // 🔥 Move to end (mark as recently used)
        contextCache.delete(cacheKey);
        contextCache.set(cacheKey, cached);

        return _mergeSemanticContext(data, cached.context, options);
    }
}

    // Perform semantic search for related items
    const semanticResults = await searchIntelligence.semanticSearch(contextText, {
        userId,
        workspaceId,
        entityTypes: options.entityTypes,
        limit: options.maxContextItems * 2,
        minSimilarity: options.minContextRelevance,
        includeContext: true
    });

    // Build semantic context
    const semanticContext = {
        relatedItems: semanticResults.results.slice(0, options.maxContextItems),
        ragContext: semanticResults.ragContext,
        intent: semanticResults.intent,
        suggestions: await _generateSuggestions(contextText, userId, workspaceId)
    };

    _cacheContext(cacheKey, semanticContext);

    // Merge with original data
    return _mergeSemanticContext(data, semanticContext, options);
}

/**
 * Extract context text from response data
 */
function _extractContextText(data) {
    const textParts = [];

    // Extract from expenses/transactions
    const items = data.expenses || data.transactions || 
                  (data.expense ? [data.expense] : []) ||
                  (data.transaction ? [data.transaction] : []);
    
    if (Array.isArray(items)) {
        items.slice(0, 10).forEach(item => {
            if (item.description) textParts.push(item.description);
            if (item.merchant) textParts.push(item.merchant);
            if (item.category) textParts.push(item.category);
            if (item.notes) textParts.push(item.notes);
        });
    }

    // Extract from budgets
    const budgets = data.budgets || (data.budget ? [data.budget] : []);
    if (Array.isArray(budgets)) {
        budgets.slice(0, 5).forEach(budget => {
            if (budget.name) textParts.push(budget.name);
            if (budget.category) textParts.push(budget.category);
            if (budget.description) textParts.push(budget.description);
        });
    }

    // Extract from single entity
    if (data.description) textParts.push(data.description);
    if (data.merchant) textParts.push(data.merchant);
    if (data.category) textParts.push(data.category);
    if (data.name) textParts.push(data.name);

    return textParts.join(' ').substring(0, 500); // Limit context size
}

/**
 * Generate suggestions based on context
 */
async function _generateSuggestions(contextText, userId, workspaceId) {
    try {
        return await searchIntelligence.getSuggestions(
            contextText.split(' ').slice(0, 3).join(' '),
            userId,
            workspaceId,
            3
        );
    } catch (error) {
        return [];
    }
}

/**
 * Merge semantic context with original data
 */
function _mergeSemanticContext(data, semanticContext, options) {
    const enriched = { ...data };

    if (options.enrichmentFields.includes('relatedItems') && semanticContext.relatedItems?.length > 0) {
        enriched._semanticContext = {
            relatedItems: semanticContext.relatedItems.map(item => ({
                entityId: item.entityId,
                entityType: item.entityType,
                text: item.text?.substring(0, 200),
                similarity: Math.round(item.similarity * 100) / 100,
                category: item.metadata?.category,
                amount: item.metadata?.amount
            }))
        };
    }

    if (options.enrichmentFields.includes('suggestions') && semanticContext.suggestions?.length > 0) {
        enriched._semanticContext = enriched._semanticContext || {};
        enriched._semanticContext.suggestions = semanticContext.suggestions;
    }

    if (options.enrichmentFields.includes('semanticContext') && semanticContext.ragContext) {
        enriched._semanticContext = enriched._semanticContext || {};
        enriched._semanticContext.stats = semanticContext.ragContext.stats;
    }

    return enriched;
}

/**
 * Generate cache key
 */
function _generateCacheKey(userId, workspaceId, text) {
    const textHash = text.split('').reduce((hash, char) => {
        return ((hash << 5) - hash) + char.charCodeAt(0);
    }, 0);
    return `${userId}_${workspaceId || 'global'}_${Math.abs(textHash).toString(36)}`;
}

/**
 * Cache semantic context
 */
function _cacheContext(key, context) {
    // If key exists, delete it to refresh insertion order
    if (contextCache.has(key)) {
        contextCache.delete(key);
    }

    contextCache.set(key, {
        context,
        timestamp: Date.now()
    });

    // 🚀 LRU eviction (remove least recently used)
    if (contextCache.size > CACHE_MAX_SIZE) {
        const lruKey = contextCache.keys().next().value;
        contextCache.delete(lruKey);
    }
}

/**
 * Clear context cache (for testing or manual refresh)
 */
function clearContextCache() {
    contextCache.clear();
}

/**
 * Middleware to attach semantic search results to request
 * Useful for routes that need explicit semantic context
 */
async function attachSemanticContext(req, res, next) {
    try {
        const query = req.query.q || req.query.search || req.body?.query;
        
        if (!query || !req.user?._id) {
            req.semanticContext = null;
            return next();
        }

        const workspaceId = req.query.workspaceId || req.params.workspaceId || req.body?.workspaceId;

        const results = await searchIntelligence.semanticSearch(query, {
            userId: req.user._id,
            workspaceId,
            limit: 10,
            includeContext: true
        });

        req.semanticContext = {
            results: results.results,
            ragContext: results.ragContext,
            intent: results.intent
        };

        next();
    } catch (error) {
        logger.warn('[SemanticContext] Failed to attach context', {
            error: error.message
        });
        req.semanticContext = null;
        next();
    }
}

/**
 * Middleware to inject RAG context for AI-powered endpoints
 */
async function injectRAGContext(req, res, next) {
    try {
        const query = req.body?.prompt || req.body?.question || req.query.q;
        
        if (!query || !req.user?._id) {
            req.ragContext = null;
            return next();
        }

        const workspaceId = req.query.workspaceId || req.params.workspaceId || req.body?.workspaceId;

        const results = await searchIntelligence.semanticSearch(query, {
            userId: req.user._id,
            workspaceId,
            limit: 10,
            includeContext: true
        });

        if (results.ragContext) {
            req.ragContext = {
                promptContext: results.ragContext.promptContext,
                chunks: results.ragContext.chunks,
                stats: results.ragContext.stats
            };
        }

        next();
    } catch (error) {
        logger.warn('[SemanticContext] Failed to inject RAG context', {
            error: error.message
        });
        req.ragContext = null;
        next();
    }
}

/**
 * Express middleware for tracking semantic query feedback
 */
function trackSemanticFeedback(req, res, next) {
    const originalJson = res.json.bind(res);

    res.json = function(data) {
        // Track if user interacted with semantic results
        if (req.semanticQueryId && data && !data.error) {
            const feedback = {
                queryId: req.semanticQueryId,
                resultCount: data.results?.length || 0,
                hasResults: (data.results?.length || 0) > 0,
                timestamp: Date.now()
            };
            
            // Log for analytics (async, don't block response)
            setImmediate(() => {
                logger.info('[SemanticContext] Query feedback', feedback);
            });
        }

        return originalJson(data);
    };

    next();
}

/**
 * Middleware to validate semantic search parameters
 */
function validateSemanticParams(req, res, next) {
    const errors = [];

    // Validate query length
    const query = req.query.q || req.body?.query;
    if (query && query.length > 1000) {
        errors.push('Query too long (max 1000 characters)');
    }

    // Validate limit
    const limit = parseInt(req.query.limit || req.body?.limit);
    if (limit && (limit < 1 || limit > 100)) {
        errors.push('Limit must be between 1 and 100');
    }

    // Validate minSimilarity
    const minSimilarity = parseFloat(req.query.minSimilarity || req.body?.minSimilarity);
    if (minSimilarity && (minSimilarity < 0 || minSimilarity > 1)) {
        errors.push('minSimilarity must be between 0 and 1');
    }

    // Validate entityTypes
    const entityTypes = req.query.entityTypes || req.body?.entityTypes;
    if (entityTypes) {
        const validTypes = ['TRANSACTION', 'NOTE', 'MERCHANT', 'BUDGET', 'GOAL', 'CATEGORY', 'RECEIPT', 'REPORT'];
        const types = Array.isArray(entityTypes) ? entityTypes : entityTypes.split(',');
        const invalidTypes = types.filter(t => !validTypes.includes(t.trim().toUpperCase()));
        if (invalidTypes.length > 0) {
            errors.push(`Invalid entity types: ${invalidTypes.join(', ')}`);
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors
        });
    }

    next();
}

module.exports = {
    createSemanticContextMiddleware,
    attachSemanticContext,
    injectRAGContext,
    trackSemanticFeedback,
    validateSemanticParams,
    clearContextCache
};
