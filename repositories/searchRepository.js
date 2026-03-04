const SearchIndex = require('../models/SearchIndex');
const SemanticIndex = require('../models/SemanticIndex');
const searchIntelligence = require('../services/searchIntelligence');
const vectorMath = require('../utils/vectorMath');
const logger = require('../utils/structuredLogger');

/**
 * Search Repository
 * Issue #796: Multi-modal search logic merging SQL/NoSQL and Vector lookups.
 * Provides unified search interface across keyword, semantic, and hybrid search modes.
 */
class SearchRepository {
    constructor() {
        this.defaultLimit = 20;
        this.maxLimit = 100;
        this.semanticWeight = 0.6;
        this.keywordWeight = 0.4;
        this.hybridThreshold = 0.3;
    }

    /**
     * Hybrid search combining keyword and semantic approaches
     * @param {string} query - Search query
     * @param {Object} options - Search options
     */
    async hybridSearch(query, options = {}) {
        const {
            userId,
            workspaceId,
            entityTypes,
            limit = this.defaultLimit,
            offset = 0,
            mode = 'hybrid', // 'keyword', 'semantic', 'hybrid'
            dateRange,
            amountRange,
            categories,
            merchants,
            sortBy = 'relevance'
        } = options;

        try {
            let results = [];

            switch (mode) {
                case 'keyword':
                    results = await this.keywordSearch(query, {
                        userId, workspaceId, entityTypes, limit: limit * 2, offset
                    });
                    break;

                case 'semantic':
                    results = await this.semanticSearch(query, {
                        userId, workspaceId, entityTypes, limit: limit * 2,
                        dateRange, amountRange, categories
                    });
                    break;

                case 'hybrid':
                default:
                    results = await this.mergeSearchResults(query, {
                        userId, workspaceId, entityTypes, limit,
                        dateRange, amountRange, categories, merchants
                    });
                    break;
            }

            // Apply post-filtering
            results = this.applyFilters(results, { dateRange, amountRange, categories, merchants });

            // Apply sorting
            results = this.applySorting(results, sortBy);

            // Apply pagination
            const paginatedResults = results.slice(offset, offset + limit);

            return {
                results: paginatedResults,
                total: results.length,
                limit,
                offset,
                mode,
                query
            };

        } catch (error) {
            logger.error('[SearchRepository] Hybrid search failed', {
                error: error.message,
                query: query.substring(0, 100)
            });
            throw error;
        }
    }

    /**
     * Traditional keyword-based search using SearchIndex
     */
    async keywordSearch(query, options = {}) {
        const { userId, workspaceId, entityTypes, limit = this.defaultLimit, offset = 0 } = options;

        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

        if (tokens.length === 0) {
            return [];
        }

        const filter = { userId };

        if (workspaceId) {
            filter.workspaceId = workspaceId;
        }

        if (entityTypes && entityTypes.length > 0) {
            filter.entityType = { $in: entityTypes };
        }

        // Search with token matching
        filter.$or = [
            { tokens: { $all: tokens } },
            { tokens: { $in: tokens } }
        ];

        const results = await SearchIndex.find(filter)
            .sort({ score: -1, lastIndexedAt: -1 })
            .skip(offset)
            .limit(limit * 2)
            .lean();

        // Calculate relevance score based on token match percentage
        return results.map(result => {
            const matchedTokens = tokens.filter(t => result.tokens.includes(t)).length;
            const tokenScore = matchedTokens / tokens.length;
            
            return {
                ...result,
                searchType: 'keyword',
                relevanceScore: tokenScore * (result.score || 1),
                matchedTokens,
                totalQueryTokens: tokens.length
            };
        });
    }

    /**
     * Semantic vector-based search using SemanticIndex
     */
    async semanticSearch(query, options = {}) {
        const {
            userId,
            workspaceId,
            entityTypes,
            limit = this.defaultLimit,
            minSimilarity = 0.3,
            dateRange,
            amountRange,
            categories
        } = options;

        const searchResults = await searchIntelligence.semanticSearch(query, {
            userId,
            workspaceId,
            entityTypes,
            limit: limit * 2,
            minSimilarity,
            includeContext: false,
            dateRange,
            amountRange,
            categories
        });

        return searchResults.results.map(result => ({
            entityId: result.entityId,
            entityType: result.entityType,
            metadata: result.metadata,
            searchType: 'semantic',
            relevanceScore: result.score,
            similarity: result.similarity,
            text: result.text
        }));
    }

    /**
     * Merge keyword and semantic search results
     */
    async mergeSearchResults(query, options = {}) {
        const { limit = this.defaultLimit } = options;

        // Run both searches in parallel
        const [keywordResults, semanticResults] = await Promise.all([
            this.keywordSearch(query, { ...options, limit: limit * 2 }),
            this.semanticSearch(query, { ...options, limit: limit * 2 })
        ]);

        // Create lookup map for deduplication
        const resultMap = new Map();

        // Add keyword results
        keywordResults.forEach(result => {
            const key = result.entityId.toString();
            resultMap.set(key, {
                ...result,
                keywordScore: result.relevanceScore,
                semanticScore: 0,
                combinedScore: result.relevanceScore * this.keywordWeight
            });
        });

        // Merge semantic results
        semanticResults.forEach(result => {
            const key = result.entityId.toString();
            
            if (resultMap.has(key)) {
                // Combine scores
                const existing = resultMap.get(key);
                existing.semanticScore = result.relevanceScore;
                existing.combinedScore = 
                    (existing.keywordScore * this.keywordWeight) + 
                    (result.relevanceScore * this.semanticWeight);
                existing.searchType = 'hybrid';
                existing.similarity = result.similarity;
            } else {
                // Add new semantic result
                resultMap.set(key, {
                    ...result,
                    keywordScore: 0,
                    semanticScore: result.relevanceScore,
                    combinedScore: result.relevanceScore * this.semanticWeight
                });
            }
        });

        // Convert to array and sort by combined score
        const mergedResults = Array.from(resultMap.values())
            .sort((a, b) => b.combinedScore - a.combinedScore);

        return mergedResults;
    }

    /**
     * Apply post-search filters
     */
    applyFilters(results, filters) {
        let filtered = [...results];

        if (filters.dateRange) {
            filtered = filtered.filter(r => {
                const date = r.metadata?.date || r.date;
                if (!date) return true;
                const d = new Date(date);
                return d >= filters.dateRange.start && d <= filters.dateRange.end;
            });
        }

        if (filters.amountRange) {
            filtered = filtered.filter(r => {
                const amount = r.metadata?.amount || r.amount;
                if (amount === undefined) return true;
                return amount >= filters.amountRange.min && amount <= filters.amountRange.max;
            });
        }

        if (filters.categories && filters.categories.length > 0) {
            const categorySet = new Set(filters.categories.map(c => c.toLowerCase()));
            filtered = filtered.filter(r => {
                const category = r.metadata?.category || r.category;
                return !category || categorySet.has(category.toLowerCase());
            });
        }

        if (filters.merchants && filters.merchants.length > 0) {
            const merchantSet = new Set(filters.merchants.map(m => m.toLowerCase()));
            filtered = filtered.filter(r => {
                const merchant = r.metadata?.merchant || r.merchant;
                return !merchant || merchantSet.has(merchant.toLowerCase());
            });
        }

        return filtered;
    }

    /**
     * Apply sorting to results
     */
    applySorting(results, sortBy) {
        switch (sortBy) {
            case 'relevance':
                return results.sort((a, b) => 
                    (b.combinedScore || b.relevanceScore || 0) - 
                    (a.combinedScore || a.relevanceScore || 0)
                );

            case 'date_desc':
                return results.sort((a, b) => {
                    const dateA = new Date(a.metadata?.date || a.date || 0);
                    const dateB = new Date(b.metadata?.date || b.date || 0);
                    return dateB - dateA;
                });

            case 'date_asc':
                return results.sort((a, b) => {
                    const dateA = new Date(a.metadata?.date || a.date || 0);
                    const dateB = new Date(b.metadata?.date || b.date || 0);
                    return dateA - dateB;
                });

            case 'amount_desc':
                return results.sort((a, b) => 
                    (b.metadata?.amount || b.amount || 0) - 
                    (a.metadata?.amount || a.amount || 0)
                );

            case 'amount_asc':
                return results.sort((a, b) => 
                    (a.metadata?.amount || a.amount || 0) - 
                    (b.metadata?.amount || b.amount || 0)
                );

            default:
                return results;
        }
    }

    /**
     * Search with natural language query (RAG-enabled)
     */
    async naturalLanguageSearch(query, options = {}) {
        const {
            userId,
            workspaceId,
            limit = this.defaultLimit,
            includeRAGContext = true
        } = options;

        // Get semantic search results with RAG context
        const searchResults = await searchIntelligence.semanticSearch(query, {
            userId,
            workspaceId,
            limit,
            includeContext: includeRAGContext
        });

        return {
            results: searchResults.results,
            intent: searchResults.intent,
            ragContext: searchResults.ragContext,
            query
        };
    }

    /**
     * Get search suggestions based on partial query
     */
    async getSuggestions(partialQuery, options = {}) {
        const { userId, workspaceId, limit = 5 } = options;

        // Get semantic suggestions
        const semanticSuggestions = await searchIntelligence.getSuggestions(
            partialQuery,
            userId,
            workspaceId,
            limit
        );

        // Get keyword-based suggestions from recent searches
        const keywordSuggestions = await this.getRecentSearchSuggestions(
            partialQuery,
            userId,
            limit
        );

        // Merge and deduplicate
        const allSuggestions = [...semanticSuggestions];
        const seen = new Set(semanticSuggestions.map(s => s.text.toLowerCase()));

        keywordSuggestions.forEach(s => {
            if (!seen.has(s.text.toLowerCase())) {
                allSuggestions.push(s);
                seen.add(s.text.toLowerCase());
            }
        });

        return allSuggestions.slice(0, limit);
    }

    /**
     * Get suggestions from recent searches (keyword-based)
     */
    async getRecentSearchSuggestions(partialQuery, userId, limit) {
        const tokens = partialQuery.toLowerCase().split(/\s+/).filter(t => t.length > 1);
        
        if (tokens.length === 0) {
            return [];
        }

        // Search for entries with matching tokens
        const results = await SearchIndex.find({
            userId,
            tokens: { $regex: new RegExp(`^${tokens[tokens.length - 1]}`, 'i') }
        })
        .select('metadata.description entityType')
        .limit(limit * 2)
        .lean();

        return results
            .filter(r => r.metadata?.description)
            .map(r => ({
                text: r.metadata.description.substring(0, 100),
                type: r.entityType,
                source: 'keyword'
            }))
            .slice(0, limit);
    }

    /**
     * Record search for analytics and suggestions
     */
    async recordSearch(query, userId, workspaceId, resultCount) {
        // This would integrate with analytics service
        logger.info('[SearchRepository] Search recorded', {
            query: query.substring(0, 100),
            userId,
            workspaceId,
            resultCount
        });
    }

    /**
     * Find similar entities to a given entity
     */
    async findSimilar(entityId, options = {}) {
        const { userId, workspaceId, limit = 10, minSimilarity = 0.5 } = options;

        // Get the source entity's semantic index
        const sourceEntry = await SemanticIndex.findOne({ entityId });
        
        if (!sourceEntry || !sourceEntry.compositeVector?.length) {
            return [];
        }

        // Build filter
        const filter = {
            status: 'INDEXED',
            entityId: { $ne: entityId }, // Exclude the source entity
            compositeVector: { $exists: true, $ne: [] }
        };

        if (userId) filter.userId = userId;
        if (workspaceId) filter.workspaceId = workspaceId;

        // Get candidates
        const candidates = await SemanticIndex.find(filter)
            .select('entityId entityType compositeVector sourceText financialContext')
            .limit(500)
            .lean();

        // Calculate similarities
        const similarEntities = candidates
            .map(candidate => ({
                ...candidate,
                similarity: vectorMath.cosineSimilarity(
                    sourceEntry.compositeVector,
                    candidate.compositeVector
                )
            }))
            .filter(c => c.similarity >= minSimilarity)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);

        return similarEntities.map(e => ({
            entityId: e.entityId,
            entityType: e.entityType,
            text: e.sourceText?.substring(0, 200),
            similarity: e.similarity,
            metadata: e.financialContext
        }));
    }

    /**
     * Aggregate search results by category/merchant
     */
    async aggregateResults(query, options = {}) {
        const { userId, workspaceId, groupBy = 'category' } = options;

        // Get search results
        const searchResults = await this.hybridSearch(query, {
            userId,
            workspaceId,
            limit: 100
        });

        // Aggregate by groupBy field
        const aggregation = {};

        searchResults.results.forEach(result => {
            const key = result.metadata?.[groupBy] || result[groupBy] || 'Unknown';
            
            if (!aggregation[key]) {
                aggregation[key] = {
                    name: key,
                    count: 0,
                    totalAmount: 0,
                    avgRelevance: 0,
                    items: []
                };
            }

            aggregation[key].count++;
            aggregation[key].totalAmount += result.metadata?.amount || result.amount || 0;
            aggregation[key].avgRelevance += result.combinedScore || result.relevanceScore || 0;
            aggregation[key].items.push(result);
        });

        // Calculate averages
        Object.values(aggregation).forEach(group => {
            group.avgRelevance = group.count > 0 ? group.avgRelevance / group.count : 0;
        });

        return {
            query,
            groupBy,
            groups: Object.values(aggregation).sort((a, b) => b.count - a.count),
            totalResults: searchResults.total
        };
    }

    /**
     * Search within a specific date range with semantic understanding
     */
    async temporalSearch(query, timeframe, options = {}) {
        const dateRange = this.parseDateRange(timeframe);
        
        return this.hybridSearch(query, {
            ...options,
            dateRange
        });
    }

    /**
     * Parse temporal expressions into date ranges
     */
    parseDateRange(timeframe) {
        const now = new Date();
        let start, end;

        switch (timeframe.toLowerCase()) {
            case 'today':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                end = now;
                break;

            case 'yesterday':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;

            case 'this week':
                start = new Date(now);
                start.setDate(start.getDate() - start.getDay());
                end = now;
                break;

            case 'last week':
                start = new Date(now);
                start.setDate(start.getDate() - start.getDay() - 7);
                end = new Date(now);
                end.setDate(end.getDate() - end.getDay());
                break;

            case 'this month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = now;
                break;

            case 'last month':
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                end = new Date(now.getFullYear(), now.getMonth(), 0);
                break;

            case 'this quarter':
                const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
                start = new Date(now.getFullYear(), quarterMonth, 1);
                end = now;
                break;

            case 'last quarter':
                const lastQuarterMonth = Math.floor(now.getMonth() / 3) * 3 - 3;
                start = new Date(now.getFullYear(), lastQuarterMonth, 1);
                end = new Date(now.getFullYear(), lastQuarterMonth + 3, 0);
                break;

            case 'this year':
                start = new Date(now.getFullYear(), 0, 1);
                end = now;
                break;

            case 'last year':
                start = new Date(now.getFullYear() - 1, 0, 1);
                end = new Date(now.getFullYear() - 1, 11, 31);
                break;

            default:
                // Default to last 30 days
                start = new Date(now);
                start.setDate(start.getDate() - 30);
                end = now;
        }

        return { start, end };
    }

    /**
     * Get search statistics
     */
    async getSearchStats(userId, workspaceId) {
        const [keywordStats, semanticStats] = await Promise.all([
            SearchIndex.aggregate([
                { $match: { userId: userId, ...(workspaceId && { workspaceId }) } },
                {
                    $group: {
                        _id: '$entityType',
                        count: { $sum: 1 },
                        avgScore: { $avg: '$score' }
                    }
                }
            ]),
            SemanticIndex.getClusterStats(workspaceId)
        ]);

        return {
            keywordIndex: {
                byEntityType: keywordStats
            },
            semanticIndex: {
                byEntityType: semanticStats
            }
        };
    }
}

module.exports = new SearchRepository();
