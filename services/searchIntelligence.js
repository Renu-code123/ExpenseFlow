const SemanticIndex = require('../models/SemanticIndex');
const vectorMath = require('../utils/vectorMath');
const logger = require('../utils/structuredLogger');

/**
 * Search Intelligence Service
 * Issue #796: Orchestrating embedding generation and proximity search.
 * Handles semantic search, RAG context retrieval, and natural language query processing.
 */
class SearchIntelligenceService {
    constructor() {
        this.embeddingDimension = 384;
        this.defaultSimilarityThreshold = 0.5;
        this.maxResultsPerQuery = 50;
        this.ragContextWindow = 10;
        
        // Local embedding cache for frequently accessed vectors
        this.embeddingCache = new Map();
        this.cacheMaxSize = 1000;
        this.cacheTTL = 60 * 60 * 1000; // 1 hour
    }

    /**
     * Process a natural language query and return semantically relevant results
     * @param {string} query - Natural language query (e.g., "Where did most of my high-risk marketing spend go last quarter?")
     * @param {Object} options - Search options
     */
    async semanticSearch(query, options = {}) {
        const {
            userId,
            workspaceId,
            entityTypes,
            limit = 20,
            minSimilarity = this.defaultSimilarityThreshold,
            includeContext = true,
            dateRange,
            amountRange,
            categories
        } = options;

        try {
            logger.info('[SearchIntelligence] Processing semantic query', {
                queryLength: query.length,
                userId,
                workspaceId
            });

            // Step 1: Generate embedding for query
            const queryVector = await this.generateEmbedding(query);
            
            // Step 2: Extract query intent and filters
            const queryIntent = this.analyzeQueryIntent(query);
            
            // Step 3: Build search filter
            const searchFilter = this._buildSearchFilter({
                userId,
                workspaceId,
                entityTypes,
                dateRange,
                amountRange,
                categories,
                queryIntent
            });

            // Step 4: Perform vector proximity search
            const candidates = await this._getSearchCandidates(searchFilter, limit * 3);
            
            // Step 5: Calculate similarities and rank
            const rankedResults = this._rankByProximity(candidates, queryVector, queryIntent);
            
            // Step 6: Filter by threshold and limit
            const filteredResults = rankedResults
                .filter(r => r.similarity >= minSimilarity)
                .slice(0, limit);

            // Step 7: Optionally enrich with RAG context
            let ragContext = null;
            if (includeContext) {
                ragContext = this._buildRAGContext(filteredResults, query, queryIntent);
            }

            // Step 8: Record query for feedback learning
            await this._recordQueryMetrics(query, queryVector, filteredResults.length, userId);

            return {
                query,
                intent: queryIntent,
                results: filteredResults.map(r => ({
                    entityId: r.entityId,
                    entityType: r.entityType,
                    text: r.sourceText,
                    similarity: r.similarity,
                    score: r.score,
                    metadata: r.financialContext,
                    semanticMetadata: r.semanticMetadata
                })),
                ragContext,
                totalCandidates: candidates.length,
                processingTime: Date.now()
            };

        } catch (error) {
            logger.error('[SearchIntelligence] Semantic search failed', {
                error: error.message,
                query: query.substring(0, 100)
            });
            throw error;
        }
    }

    /**
     * Generate embedding vector for text
     * Uses local transformer model or falls back to rule-based embedding
     */
    async generateEmbedding(text) {
        // Check cache first
        const cacheKey = this._hashText(text);
        const cached = this.embeddingCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.vector;
        }

        try {
            // Normalize text
            const normalizedText = this._normalizeText(text);
            
            // Generate embedding using local inference
            const vector = await this._localEmbedding(normalizedText);
            
            // Cache result
            this._cacheEmbedding(cacheKey, vector);
            
            return vector;
        } catch (error) {
            logger.warn('[SearchIntelligence] Embedding generation fallback', { error: error.message });
            // Fallback to rule-based embedding
            return this._fallbackEmbedding(text);
        }
    }

    /**
     * Local embedding generation using TF-IDF inspired approach
     * In production, this would use a local transformer model
     */
    async _localEmbedding(text) {
        const tokens = text.toLowerCase().split(/\s+/).filter(t => t.length > 1);
        const vector = new Array(this.embeddingDimension).fill(0);
        
        // Financial domain vocabulary with weighted indices
        const domainVocab = this._getFinancialVocabulary();
        
        tokens.forEach((token, idx) => {
            // Hash token to vector index
            const hash = this._hashToken(token);
            const primaryIdx = hash % this.embeddingDimension;
            const secondaryIdx = (hash * 31) % this.embeddingDimension;
            
            // Apply TF-IDF-like weighting
            const idf = domainVocab[token]?.idf || 1.0;
            const domainWeight = domainVocab[token]?.weight || 1.0;
            const positionWeight = 1 / (1 + idx * 0.1); // Earlier words weighted more
            
            const contribution = idf * domainWeight * positionWeight;
            
            vector[primaryIdx] += contribution;
            vector[secondaryIdx] += contribution * 0.5;
        });

        // Normalize vector
        return vectorMath.normalize(vector);
    }

    /**
     * Fallback rule-based embedding when ML model unavailable
     */
    _fallbackEmbedding(text) {
        const vector = new Array(this.embeddingDimension).fill(0);
        const tokens = text.toLowerCase().split(/\s+/);
        
        tokens.forEach(token => {
            const hash = this._hashToken(token);
            const idx = hash % this.embeddingDimension;
            vector[idx] += 1;
        });
        
        return vectorMath.normalize(vector);
    }

    /**
     * Analyze query to extract intent and implicit filters
     */
    analyzeQueryIntent(query) {
        const lowerQuery = query.toLowerCase();
        
        const intent = {
            type: 'GENERAL',
            timeframe: null,
            aggregation: null,
            comparison: false,
            riskFocus: false,
            categoryFocus: null,
            merchantFocus: null,
            amountFocus: null,
            keywords: []
        };

        // Detect time-related intent
        if (/last\s+(week|month|quarter|year)/i.test(lowerQuery)) {
            intent.timeframe = lowerQuery.match(/last\s+(week|month|quarter|year)/i)[1];
        }
        if (/this\s+(week|month|quarter|year)/i.test(lowerQuery)) {
            intent.timeframe = 'current_' + lowerQuery.match(/this\s+(week|month|quarter|year)/i)[1];
        }

        // Detect aggregation intent
        if (/most|highest|largest|top/i.test(lowerQuery)) {
            intent.aggregation = 'MAX';
            intent.type = 'AGGREGATION';
        }
        if (/least|lowest|smallest|bottom/i.test(lowerQuery)) {
            intent.aggregation = 'MIN';
            intent.type = 'AGGREGATION';
        }
        if (/total|sum|all/i.test(lowerQuery)) {
            intent.aggregation = 'SUM';
            intent.type = 'AGGREGATION';
        }
        if (/average|avg|mean/i.test(lowerQuery)) {
            intent.aggregation = 'AVG';
            intent.type = 'AGGREGATION';
        }

        // Detect comparison intent
        if (/compar|versus|vs\.?|between/i.test(lowerQuery)) {
            intent.comparison = true;
            intent.type = 'COMPARISON';
        }

        // Detect risk focus
        if (/risk|risky|dangerous|suspicious|unusual|anomal/i.test(lowerQuery)) {
            intent.riskFocus = true;
        }

        // Detect category focus
        const categoryPatterns = [
            'marketing', 'travel', 'food', 'entertainment', 'utilities',
            'salary', 'rent', 'subscription', 'software', 'hardware',
            'office', 'supplies', 'transport', 'medical', 'insurance'
        ];
        categoryPatterns.forEach(cat => {
            if (lowerQuery.includes(cat)) {
                intent.categoryFocus = cat;
            }
        });

        // Detect amount focus
        if (/expensive|costly|high.?value|big\s+spend/i.test(lowerQuery)) {
            intent.amountFocus = 'HIGH';
        }
        if (/cheap|small|minor|low.?value/i.test(lowerQuery)) {
            intent.amountFocus = 'LOW';
        }

        // Extract keywords (nouns and verbs)
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 
            'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 
            'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 
            'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 
            'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
            'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
            'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
            'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
            'my', 'our', 'your', 'his', 'her', 'its', 'their', 'what', 'which', 'who',
            'whom', 'this', 'that', 'these', 'those', 'am', 'and', 'but', 'if', 'or',
            'because', 'until', 'while', 'did', 'go', 'went', 'where']);
        
        intent.keywords = lowerQuery
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));

        return intent;
    }

    /**
     * Build search filter from options and query intent
     */
    _buildSearchFilter(options) {
        const filter = { status: 'INDEXED' };

        if (options.userId) {
            filter.userId = options.userId;
        }
        if (options.workspaceId) {
            filter.workspaceId = options.workspaceId;
        }
        if (options.entityTypes && options.entityTypes.length > 0) {
            filter.entityType = { $in: options.entityTypes };
        }
        if (options.categories && options.categories.length > 0) {
            filter['financialContext.category'] = { $in: options.categories };
        }

        // Apply date range filter
        if (options.dateRange) {
            filter['financialContext.date'] = {
                $gte: options.dateRange.start,
                $lte: options.dateRange.end
            };
        } else if (options.queryIntent?.timeframe) {
            const dateRange = this._getDateRangeFromTimeframe(options.queryIntent.timeframe);
            if (dateRange) {
                filter['financialContext.date'] = {
                    $gte: dateRange.start,
                    $lte: dateRange.end
                };
            }
        }

        // Apply amount range filter
        if (options.amountRange) {
            filter['financialContext.amount'] = {
                $gte: options.amountRange.min,
                $lte: options.amountRange.max
            };
        }

        // Apply risk filter from intent
        if (options.queryIntent?.riskFocus) {
            filter['financialContext.riskLevel'] = { $in: ['HIGH', 'CRITICAL'] };
        }

        return filter;
    }

    /**
     * Get search candidates from database
     */
    async _getSearchCandidates(filter, limit) {
        return SemanticIndex.find(filter)
            .select('entityId entityType compositeVector sourceText financialContext semanticMetadata qualityScore relevanceBoost')
            .limit(limit)
            .lean();
    }

    /**
     * Rank candidates by vector proximity and intent relevance
     */
    _rankByProximity(candidates, queryVector, queryIntent) {
        return candidates
            .map(doc => {
                // Calculate base similarity
                const similarity = vectorMath.cosineSimilarity(
                    queryVector, 
                    doc.compositeVector || []
                );

                // Calculate intent boost
                let intentBoost = 1.0;
                
                // Boost based on category match
                if (queryIntent.categoryFocus && 
                    doc.financialContext?.category?.toLowerCase().includes(queryIntent.categoryFocus)) {
                    intentBoost *= 1.5;
                }

                // Boost based on risk focus
                if (queryIntent.riskFocus && 
                    ['HIGH', 'CRITICAL'].includes(doc.financialContext?.riskLevel)) {
                    intentBoost *= 1.3;
                }

                // Boost based on amount focus
                if (queryIntent.amountFocus === 'HIGH' && doc.financialContext?.amount > 1000) {
                    intentBoost *= 1.2;
                }
                if (queryIntent.amountFocus === 'LOW' && doc.financialContext?.amount < 100) {
                    intentBoost *= 1.2;
                }

                // Keyword match boost
                const textLower = doc.sourceText?.toLowerCase() || '';
                const keywordMatches = queryIntent.keywords.filter(kw => textLower.includes(kw)).length;
                if (keywordMatches > 0) {
                    intentBoost *= 1 + (keywordMatches * 0.1);
                }

                // Calculate final score
                const score = similarity * intentBoost * (doc.relevanceBoost || 1) * (doc.qualityScore || 1);

                return {
                    ...doc,
                    similarity,
                    intentBoost,
                    score
                };
            })
            .sort((a, b) => b.score - a.score);
    }

    /**
     * Build RAG context from search results
     */
    _buildRAGContext(results, query, queryIntent) {
        const topResults = results.slice(0, this.ragContextWindow);
        
        // Build structured context for RAG
        const contextChunks = topResults.map((r, idx) => ({
            rank: idx + 1,
            text: r.sourceText,
            entityType: r.entityType,
            relevance: r.score,
            metadata: {
                amount: r.financialContext?.amount,
                category: r.financialContext?.category,
                merchant: r.financialContext?.merchant,
                date: r.financialContext?.date,
                riskLevel: r.financialContext?.riskLevel
            }
        }));

        // Generate summary statistics
        const stats = this._calculateContextStats(topResults);

        // Build prompt context
        const promptContext = this._formatForPrompt(contextChunks, queryIntent);

        return {
            chunks: contextChunks,
            stats,
            promptContext,
            query,
            intent: queryIntent
        };
    }

    /**
     * Calculate statistics from context results
     */
    _calculateContextStats(results) {
        const amounts = results
            .map(r => r.financialContext?.amount)
            .filter(a => typeof a === 'number');

        const categories = {};
        const merchants = {};

        results.forEach(r => {
            if (r.financialContext?.category) {
                categories[r.financialContext.category] = 
                    (categories[r.financialContext.category] || 0) + 1;
            }
            if (r.financialContext?.merchant) {
                merchants[r.financialContext.merchant] = 
                    (merchants[r.financialContext.merchant] || 0) + 1;
            }
        });

        return {
            totalResults: results.length,
            amountStats: amounts.length > 0 ? {
                total: amounts.reduce((a, b) => a + b, 0),
                average: amounts.reduce((a, b) => a + b, 0) / amounts.length,
                min: Math.min(...amounts),
                max: Math.max(...amounts)
            } : null,
            topCategories: Object.entries(categories)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count]) => ({ name, count })),
            topMerchants: Object.entries(merchants)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count]) => ({ name, count }))
        };
    }

    /**
     * Format context chunks for LLM prompt
     */
    _formatForPrompt(chunks, queryIntent) {
        let prompt = `Based on the following financial records:\n\n`;

        chunks.forEach(chunk => {
            prompt += `[${chunk.entityType}] ${chunk.text}`;
            if (chunk.metadata.amount) {
                prompt += ` (Amount: $${chunk.metadata.amount.toFixed(2)})`;
            }
            if (chunk.metadata.category) {
                prompt += ` Category: ${chunk.metadata.category}`;
            }
            if (chunk.metadata.merchant) {
                prompt += ` Merchant: ${chunk.metadata.merchant}`;
            }
            prompt += `\n`;
        });

        if (queryIntent.aggregation) {
            prompt += `\nPlease provide a ${queryIntent.aggregation.toLowerCase()} analysis.`;
        }

        return prompt;
    }

    /**
     * Index a new entity for semantic search
     */
    async indexEntity(entityData) {
        const {
            entityId,
            entityType,
            text,
            userId,
            workspaceId,
            financialContext,
            clusterId
        } = entityData;

        try {
            // Generate embedding
            const compositeVector = await this.generateEmbedding(text);

            // Extract semantic metadata
            const semanticMetadata = this._extractSemanticMetadata(text, financialContext);

            // Create or update index entry
            const indexEntry = await SemanticIndex.findOneAndUpdate(
                { entityId },
                {
                    entityId,
                    entityType,
                    sourceText: text,
                    userId,
                    workspaceId,
                    clusterId,
                    compositeVector,
                    vectorDimension: compositeVector.length,
                    financialContext,
                    semanticMetadata,
                    status: 'INDEXED',
                    indexedAt: new Date()
                },
                { upsert: true, new: true }
            );

            logger.info('[SearchIntelligence] Entity indexed', {
                entityId,
                entityType,
                vectorDim: compositeVector.length
            });

            return indexEntry;

        } catch (error) {
            logger.error('[SearchIntelligence] Entity indexing failed', {
                entityId,
                error: error.message
            });
            
            // Create failed entry for retry
            await SemanticIndex.findOneAndUpdate(
                { entityId },
                {
                    entityId,
                    entityType,
                    sourceText: text,
                    userId,
                    workspaceId,
                    status: 'FAILED',
                    lastError: error.message,
                    $inc: { retryCount: 1 }
                },
                { upsert: true }
            );
            
            throw error;
        }
    }

    /**
     * Batch index multiple entities
     */
    async batchIndexEntities(entities) {
        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        for (const entity of entities) {
            try {
                await this.indexEntity(entity);
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({
                    entityId: entity.entityId,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Remove entity from semantic index
     */
    async deindexEntity(entityId) {
        await SemanticIndex.deleteOne({ entityId });
        logger.info('[SearchIntelligence] Entity deindexed', { entityId });
    }

    /**
     * Extract semantic metadata from text and context
     */
    _extractSemanticMetadata(text, financialContext) {
        const lowerText = text.toLowerCase();
        
        // Extract topics
        const topicPatterns = {
            'marketing': /marketing|advertising|campaign|promotion/i,
            'travel': /travel|flight|hotel|transportation|uber|lyft/i,
            'food': /food|restaurant|grocery|meal|lunch|dinner|breakfast/i,
            'software': /software|subscription|saas|license/i,
            'utilities': /utility|electric|water|gas|internet|phone/i,
            'payroll': /salary|payroll|wage|compensation|bonus/i,
            'equipment': /equipment|hardware|device|computer|laptop/i,
            'rent': /rent|lease|office\s+space/i,
            'insurance': /insurance|coverage|policy|premium/i
        };

        const primaryTopics = [];
        for (const [topic, pattern] of Object.entries(topicPatterns)) {
            if (pattern.test(lowerText)) {
                primaryTopics.push(topic);
            }
        }

        // Simple sentiment analysis
        const positiveWords = /good|great|excellent|success|profit|gain|saving/gi;
        const negativeWords = /bad|poor|loss|expense|cost|risk|fraud|suspicious/gi;
        const positiveCount = (lowerText.match(positiveWords) || []).length;
        const negativeCount = (lowerText.match(negativeWords) || []).length;
        const sentimentScore = (positiveCount - negativeCount) / Math.max(1, positiveCount + negativeCount);

        // Risk indicator
        const riskWords = /risk|suspicious|unusual|fraud|anomaly|warning|alert/gi;
        const riskMatches = (lowerText.match(riskWords) || []).length;
        const riskIndicator = Math.min(1, riskMatches * 0.2);

        // Determine amount magnitude
        let amountMagnitude = 'MEDIUM';
        if (financialContext?.amount) {
            if (financialContext.amount < 50) amountMagnitude = 'MICRO';
            else if (financialContext.amount < 500) amountMagnitude = 'SMALL';
            else if (financialContext.amount < 5000) amountMagnitude = 'MEDIUM';
            else if (financialContext.amount < 50000) amountMagnitude = 'LARGE';
            else amountMagnitude = 'ENTERPRISE';
        }

        return {
            primaryTopics,
            sentimentScore,
            riskIndicator,
            financialCategory: financialContext?.category,
            amountMagnitude,
            extractedEntities: this._extractEntities(text)
        };
    }

    /**
     * Extract named entities from text
     */
    _extractEntities(text) {
        const entities = [];

        // Extract currency amounts
        const amountPattern = /\$[\d,]+(?:\.\d{2})?/g;
        const amounts = text.match(amountPattern) || [];
        amounts.forEach(amount => {
            entities.push({ type: 'AMOUNT', value: amount, confidence: 0.9 });
        });

        // Extract dates
        const datePattern = /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/g;
        const dates = text.match(datePattern) || [];
        dates.forEach(date => {
            entities.push({ type: 'DATE', value: date, confidence: 0.85 });
        });

        // Extract percentages
        const percentPattern = /\d+(?:\.\d+)?%/g;
        const percents = text.match(percentPattern) || [];
        percents.forEach(percent => {
            entities.push({ type: 'PERCENTAGE', value: percent, confidence: 0.9 });
        });

        return entities;
    }

    /**
     * Get date range from timeframe string
     */
    _getDateRangeFromTimeframe(timeframe) {
        const now = new Date();
        let start, end;

        switch (timeframe) {
            case 'week':
                start = new Date(now);
                start.setDate(start.getDate() - 7);
                end = now;
                break;
            case 'month':
                start = new Date(now);
                start.setMonth(start.getMonth() - 1);
                end = now;
                break;
            case 'quarter':
                start = new Date(now);
                start.setMonth(start.getMonth() - 3);
                end = now;
                break;
            case 'year':
                start = new Date(now);
                start.setFullYear(start.getFullYear() - 1);
                end = now;
                break;
            case 'current_week':
                start = new Date(now);
                start.setDate(start.getDate() - start.getDay());
                end = now;
                break;
            case 'current_month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = now;
                break;
            case 'current_quarter':
                const quarterStart = Math.floor(now.getMonth() / 3) * 3;
                start = new Date(now.getFullYear(), quarterStart, 1);
                end = now;
                break;
            case 'current_year':
                start = new Date(now.getFullYear(), 0, 1);
                end = now;
                break;
            default:
                return null;
        }

        return { start, end };
    }

    /**
     * Record query metrics for analytics
     */
    async _recordQueryMetrics(query, queryVector, resultCount, userId) {
        // Store for feedback learning (simplified - would integrate with analytics)
        logger.debug('[SearchIntelligence] Query recorded', {
            queryHash: this._hashText(query),
            resultCount,
            userId
        });
    }

    /**
     * Get financial domain vocabulary with weights
     */
    _getFinancialVocabulary() {
        return {
            'expense': { idf: 1.2, weight: 1.5 },
            'transaction': { idf: 1.1, weight: 1.4 },
            'payment': { idf: 1.2, weight: 1.4 },
            'invoice': { idf: 1.3, weight: 1.5 },
            'budget': { idf: 1.3, weight: 1.5 },
            'revenue': { idf: 1.4, weight: 1.6 },
            'profit': { idf: 1.4, weight: 1.6 },
            'loss': { idf: 1.4, weight: 1.6 },
            'refund': { idf: 1.5, weight: 1.4 },
            'subscription': { idf: 1.3, weight: 1.3 },
            'recurring': { idf: 1.2, weight: 1.3 },
            'marketing': { idf: 1.3, weight: 1.4 },
            'travel': { idf: 1.2, weight: 1.3 },
            'salary': { idf: 1.4, weight: 1.5 },
            'vendor': { idf: 1.3, weight: 1.4 },
            'merchant': { idf: 1.2, weight: 1.4 },
            'category': { idf: 1.1, weight: 1.2 },
            'risk': { idf: 1.5, weight: 1.7 },
            'fraud': { idf: 1.8, weight: 2.0 },
            'suspicious': { idf: 1.6, weight: 1.8 },
            'anomaly': { idf: 1.7, weight: 1.9 }
        };
    }

    /**
     * Hash text for caching
     */
    _hashText(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Hash token to index
     */
    _hashToken(token) {
        let hash = 5381;
        for (let i = 0; i < token.length; i++) {
            hash = ((hash << 5) + hash) + token.charCodeAt(i);
        }
        return Math.abs(hash);
    }

    /**
     * Normalize text for embedding
     */
    _normalizeText(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Cache embedding result
     */
    _cacheEmbedding(key, vector) {
        // Prune cache if full
        if (this.embeddingCache.size >= this.cacheMaxSize) {
            const firstKey = this.embeddingCache.keys().next().value;
            this.embeddingCache.delete(firstKey);
        }
        
        this.embeddingCache.set(key, {
            vector,
            timestamp: Date.now()
        });
    }

    /**
     * Process feedback for a search result
     */
    async processFeedback(entityId, userId, queryText, relevanceScore, clicked) {
        const entry = await SemanticIndex.findOne({ entityId });
        if (entry) {
            await entry.addFeedback(userId, queryText, relevanceScore, clicked);
        }
    }

    /**
     * Get search suggestions based on partial query
     */
    async getSuggestions(partialQuery, userId, workspaceId, limit = 5) {
        // Find entries with matching keywords
        const normalizedQuery = this._normalizeText(partialQuery);
        const keywords = normalizedQuery.split(/\s+/).filter(k => k.length > 2);

        if (keywords.length === 0) return [];

        const suggestions = await SemanticIndex.find({
            userId,
            workspaceId,
            status: 'INDEXED',
            $text: { $search: keywords.join(' ') }
        })
        .select('sourceText entityType financialContext.category')
        .limit(limit * 2)
        .lean();

        // Extract unique suggestion texts
        const seen = new Set();
        return suggestions
            .map(s => ({
                text: s.sourceText.substring(0, 100),
                category: s.financialContext?.category,
                type: s.entityType
            }))
            .filter(s => {
                const key = s.text.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, limit);
    }
}

module.exports = new SearchIntelligenceService();
