const SearchIndex = require('../models/SearchIndex');
const SemanticIndex = require('../models/SemanticIndex');
const searchIntelligence = require('./searchIntelligence');
const logger = require('../utils/structuredLogger');

/**
 * Indexing Engine
 * Issue #756: The brain for tokenization and cross-entity indexing.
 * Issue #796: JIT vectorization pipeline for semantic search.
 * Transforms raw database objects into searchable, tenant-isolated vectors.
 */
class IndexingEngine {
    constructor() {
        // Issue #796: Semantic indexing configuration
        this.semanticIndexingEnabled = true;
        this.semanticIndexQueue = [];
        this.semanticBatchSize = 10;
        this.semanticFlushInterval = 5000; // 5 seconds
        this.isProcessingSemanticQueue = false;

        // Start background semantic indexing processor
        this._startSemanticQueueProcessor();
    }

    /**
     * Index a single entity (keyword + semantic)
     */
    async indexEntity(entityType, entityData, userId, workspaceId = null) {
        try {
            const tokens = this._tokenize(entityData);

            const indexData = {
                entityId: entityData._id,
                entityType,
                workspaceId,
                userId,
                tokens,
                metadata: {
                    description: entityData.description || entityData.name,
                    amount: entityData.amount,
                    category: entityData.category,
                    merchant: entityData.merchant,
                    date: entityData.date
                },
                lastIndexedAt: new Date()
            };

            // Keyword indexing
            await SearchIndex.findOneAndUpdate(
                { entityId: entityData._id },
                indexData,
                { upsert: true, new: true }
            );

            // Issue #796: Queue for semantic indexing (JIT vectorization)
            if (this.semanticIndexingEnabled) {
                await this._queueSemanticIndexing(entityType, entityData, userId, workspaceId);
            }

            // console.log(`[IndexingEngine] Indexed ${entityType}: ${entityData._id}`);
        } catch (error) {
            logger.error('[IndexingEngine] Error indexing entity:', {
                entityId: entityData._id,
                error: error.message
            });
        }
    }

    /**
     * Issue #796: Queue entity for semantic indexing
     */
    async _queueSemanticIndexing(entityType, entityData, userId, workspaceId) {
        const text = this._buildSemanticText(entityData);
        
        if (!text || text.trim().length < 3) {
            return; // Skip entities with insufficient text
        }

        this.semanticIndexQueue.push({
            entityId: entityData._id,
            entityType,
            text,
            userId,
            workspaceId,
            financialContext: {
                amount: entityData.amount,
                category: entityData.category,
                merchant: entityData.merchant,
                date: entityData.date,
                isRecurring: entityData.isRecurring || false,
                tags: entityData.tags || []
            },
            clusterId: workspaceId ? `${workspaceId}_default` : null,
            queuedAt: Date.now()
        });

        // Trigger immediate processing if batch size reached
        if (this.semanticIndexQueue.length >= this.semanticBatchSize) {
            this._processSemanticQueue();
        }
    }

    /**
     * Issue #796: Build semantic text from entity data
     */
    _buildSemanticText(entityData) {
        const parts = [
            entityData.description,
            entityData.name,
            entityData.merchant,
            entityData.category,
            entityData.categoryName,
            entityData.notes
        ].filter(Boolean);

        return parts.join(' ').trim();
    }

    /**
     * Issue #796: Start background semantic queue processor
     */
    _startSemanticQueueProcessor() {
        setInterval(() => {
            if (this.semanticIndexQueue.length > 0 && !this.isProcessingSemanticQueue) {
                this._processSemanticQueue();
            }
        }, this.semanticFlushInterval);
    }

    /**
     * Issue #796: Process semantic indexing queue
     */
    async _processSemanticQueue() {
        if (this.isProcessingSemanticQueue || this.semanticIndexQueue.length === 0) {
            return;
        }

        this.isProcessingSemanticQueue = true;

        try {
            // Take batch from queue
            const batch = this.semanticIndexQueue.splice(0, this.semanticBatchSize);
            
            logger.debug('[IndexingEngine] Processing semantic batch', {
                batchSize: batch.length
            });

            // Process each entity
            const results = await searchIntelligence.batchIndexEntities(batch);

            logger.info('[IndexingEngine] Semantic batch processed', {
                success: results.success,
                failed: results.failed
            });

        } catch (error) {
            logger.error('[IndexingEngine] Semantic queue processing error', {
                error: error.message
            });
        } finally {
            this.isProcessingSemanticQueue = false;
        }
    }

    /**
     * Issue #796: Force flush semantic queue
     */
    async flushSemanticQueue() {
        while (this.semanticIndexQueue.length > 0) {
            await this._processSemanticQueue();
        }
    }

    /**
     * Issue #796: Index entity semantically immediately (bypass queue)
     */
    async indexEntitySemantic(entityType, entityData, userId, workspaceId = null) {
        const text = this._buildSemanticText(entityData);
        
        if (!text || text.trim().length < 3) {
            return null;
        }

        return searchIntelligence.indexEntity({
            entityId: entityData._id,
            entityType,
            text,
            userId,
            workspaceId,
            financialContext: {
                amount: entityData.amount,
                category: entityData.category,
                merchant: entityData.merchant,
                date: entityData.date,
                isRecurring: entityData.isRecurring || false,
                tags: entityData.tags || []
            },
            clusterId: workspaceId ? `${workspaceId}_default` : null
        });
    }

    /**
     * Remove an entity from the search index (keyword + semantic)
     */
    async deindexEntity(entityId) {
        // Remove from keyword index
        await SearchIndex.deleteOne({ entityId });
        
        // Issue #796: Remove from semantic index
        await searchIntelligence.deindexEntity(entityId);
    }

    /**
     * Issue #796: Enable/disable semantic indexing
     */
    setSemanticIndexingEnabled(enabled) {
        this.semanticIndexingEnabled = enabled;
        logger.info('[IndexingEngine] Semantic indexing', { enabled });
    }

    /**
     * Issue #796: Get indexing status
     */
    getStatus() {
        return {
            semanticIndexingEnabled: this.semanticIndexingEnabled,
            semanticQueueSize: this.semanticIndexQueue.length,
            isProcessingSemanticQueue: this.isProcessingSemanticQueue
        };
    }

    /**
     * Core Tokenization Logic
     * Splits strings into searchable chunks, removes stop words, and normalizes casing.
     */
    _tokenize(data) {
        const fields = [
            data.description,
            data.merchant,
            data.categoryName, // Optional enrichment
            data.notes
        ].filter(Boolean);

        const rawText = fields.join(' ').toLowerCase();

        // Basic n-gram or word splitting
        const words = rawText.split(/[^a-z0-9]+/).filter(w => w.length > 2);

        // Add specific data like amount as tokens for numeric searching support
        if (data.amount) {
            words.push(`amt:${Math.floor(data.amount)}`);
        }

        return [...new Set(words)]; // Return unique tokens
    }

    /**
     * Search across the index
     */
    async search(query, userId, workspaceId = null, options = {}) {
        const { limit = 20, offset = 0 } = options;
        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

        const filter = {
            userId: userId,
            tokens: { $all: tokens }
        };

        if (workspaceId) {
            filter.workspaceId = workspaceId;
        }

        return await SearchIndex.find(filter)
            .sort({ score: -1, lastIndexedAt: -1 })
            .skip(offset)
            .limit(limit)
            .lean();
    }
}

module.exports = new IndexingEngine();
