const mongoose = require('mongoose');

/**
 * SemanticIndex Model
 * Issue #796: Vector embedding store for entity fragments.
 * Enables semantic, context-aware discovery using RAG (Retrieval-Augmented Generation).
 * 
 * This model stores high-dimensional vector embeddings generated from financial entities
 * (Transactions, Notes, Merchant feedback) for proximity search and natural language queries.
 */

// Schema for individual embedding fragments
const embeddingFragmentSchema = new mongoose.Schema({
    fragmentId: {
        type: String,
        required: true
    },
    text: {
        type: String,
        required: true
    },
    vector: {
        type: [Number],
        required: true,
        validate: {
            validator: function(v) {
                return v.length > 0 && v.length <= 1536; // Support up to 1536 dimensions
            },
            message: 'Vector dimension must be between 1 and 1536'
        }
    },
    fragmentType: {
        type: String,
        enum: ['DESCRIPTION', 'NOTE', 'MERCHANT', 'CATEGORY', 'TAG', 'FEEDBACK', 'METADATA'],
        default: 'DESCRIPTION'
    },
    weight: {
        type: Number,
        default: 1.0,
        min: 0,
        max: 10
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

// Schema for user feedback on search quality
const feedbackSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    queryText: String,
    relevanceScore: {
        type: Number,
        min: -1,
        max: 1,
        default: 0
    },
    clicked: {
        type: Boolean,
        default: false
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

// Main SemanticIndex schema
const semanticIndexSchema = new mongoose.Schema({
    // Source entity reference
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    entityType: {
        type: String,
        enum: [
            'TRANSACTION',
            'NOTE',
            'MERCHANT',
            'BUDGET',
            'GOAL',
            'CATEGORY',
            'RECEIPT',
            'REPORT',
            'WORKSPACE_MEMO'
        ],
        required: true,
        index: true
    },

    // Multi-tenant isolation
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Tenant-specific semantic cluster
    clusterId: {
        type: String,
        index: true
    },

    // Primary composite embedding (aggregated from fragments)
    compositeVector: {
        type: [Number],
        default: []
    },
    vectorDimension: {
        type: Number,
        default: 384 // Default dimension for lightweight models
    },

    // Individual text fragments with their embeddings
    fragments: [embeddingFragmentSchema],

    // Original text content for re-embedding
    sourceText: {
        type: String,
        required: true,
        maxlength: 10000
    },

    // Normalized/cleaned text used for embedding
    normalizedText: {
        type: String,
        maxlength: 10000
    },

    // Semantic metadata
    semanticMetadata: {
        primaryTopics: [String],
        sentimentScore: {
            type: Number,
            min: -1,
            max: 1
        },
        riskIndicator: {
            type: Number,
            min: 0,
            max: 1
        },
        financialCategory: String,
        temporalContext: {
            type: String,
            enum: ['PAST', 'PRESENT', 'FUTURE', 'RECURRING']
        },
        amountMagnitude: {
            type: String,
            enum: ['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']
        },
        extractedEntities: [{
            type: { type: String },
            value: String,
            confidence: Number
        }]
    },

    // Financial context for enhanced retrieval
    financialContext: {
        amount: Number,
        currency: { type: String, default: 'USD' },
        category: String,
        merchant: String,
        date: Date,
        isRecurring: { type: Boolean, default: false },
        riskLevel: {
            type: String,
            enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
        },
        tags: [String]
    },

    // Embedding model information
    embeddingModel: {
        name: { type: String, default: 'local-transformer' },
        version: { type: String, default: '1.0' },
        provider: { type: String, default: 'internal' }
    },

    // Quality and relevance scoring
    qualityScore: {
        type: Number,
        default: 1.0,
        min: 0,
        max: 1
    },
    relevanceBoost: {
        type: Number,
        default: 1.0
    },

    // User feedback for continuous learning
    feedback: [feedbackSchema],
    aggregatedFeedbackScore: {
        type: Number,
        default: 0
    },

    // Indexing status
    status: {
        type: String,
        enum: ['PENDING', 'INDEXED', 'FAILED', 'STALE', 'REINDEXING'],
        default: 'PENDING',
        index: true
    },
    lastError: String,
    retryCount: {
        type: Number,
        default: 0
    },

    // Timestamps
    indexedAt: Date,
    lastAccessedAt: Date,
    expiresAt: Date
}, {
    timestamps: true
});

// Compound indexes for efficient vector search and multi-tenant isolation
semanticIndexSchema.index({ workspaceId: 1, status: 1, indexedAt: -1 });
semanticIndexSchema.index({ userId: 1, entityType: 1, status: 1 });
semanticIndexSchema.index({ clusterId: 1, status: 1 });
semanticIndexSchema.index({ 'financialContext.category': 1, workspaceId: 1 });
semanticIndexSchema.index({ 'financialContext.merchant': 1, workspaceId: 1 });
semanticIndexSchema.index({ 'semanticMetadata.primaryTopics': 1 });
semanticIndexSchema.index({ aggregatedFeedbackScore: -1 });
semanticIndexSchema.index({ status: 1, retryCount: 1 });

// TTL index for automatic cleanup of stale entries
semanticIndexSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Pre-save hook to update normalized text
 */
semanticIndexSchema.pre('save', function(next) {
    if (this.isModified('sourceText')) {
        this.normalizedText = this.sourceText
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    next();
});

/**
 * Static: Find entities by semantic proximity (requires external vector search)
 */
semanticIndexSchema.statics.findByProximity = async function(queryVector, options = {}) {
    const {
        workspaceId,
        userId,
        entityTypes,
        limit = 20,
        minSimilarity = 0.5
    } = options;

    // Build filter
    const filter = { status: 'INDEXED' };
    if (workspaceId) filter.workspaceId = workspaceId;
    if (userId) filter.userId = userId;
    if (entityTypes && entityTypes.length > 0) {
        filter.entityType = { $in: entityTypes };
    }

    // Get candidates (in production, this would use a vector database)
    const candidates = await this.find(filter)
        .select('entityId entityType compositeVector sourceText financialContext semanticMetadata qualityScore relevanceBoost')
        .limit(1000)
        .lean();

    // Calculate similarities (simplified - in production use vectorMath utility)
    const vectorMath = require('../utils/vectorMath');
    const results = candidates
        .map(doc => ({
            ...doc,
            similarity: vectorMath.cosineSimilarity(queryVector, doc.compositeVector || [])
        }))
        .filter(doc => doc.similarity >= minSimilarity)
        .sort((a, b) => {
            // Sort by similarity * relevanceBoost * qualityScore
            const scoreA = a.similarity * (a.relevanceBoost || 1) * (a.qualityScore || 1);
            const scoreB = b.similarity * (b.relevanceBoost || 1) * (b.qualityScore || 1);
            return scoreB - scoreA;
        })
        .slice(0, limit);

    return results;
};

/**
 * Static: Get stale entries that need reindexing
 */
semanticIndexSchema.statics.getStaleEntries = function(staleDays = 30, limit = 100) {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - staleDays);

    return this.find({
        $or: [
            { status: 'STALE' },
            { indexedAt: { $lt: staleDate }, status: 'INDEXED' }
        ],
        retryCount: { $lt: 5 }
    })
    .sort({ indexedAt: 1 })
    .limit(limit);
};

/**
 * Static: Get entries pending indexing
 */
semanticIndexSchema.statics.getPendingEntries = function(limit = 50) {
    return this.find({
        status: { $in: ['PENDING', 'FAILED'] },
        retryCount: { $lt: 5 }
    })
    .sort({ createdAt: 1 })
    .limit(limit);
};

/**
 * Static: Get cluster statistics
 */
semanticIndexSchema.statics.getClusterStats = async function(workspaceId) {
    return this.aggregate([
        { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), status: 'INDEXED' } },
        {
            $group: {
                _id: '$entityType',
                count: { $sum: 1 },
                avgQualityScore: { $avg: '$qualityScore' },
                avgFeedbackScore: { $avg: '$aggregatedFeedbackScore' }
            }
        }
    ]);
};

/**
 * Instance: Add user feedback
 */
semanticIndexSchema.methods.addFeedback = async function(userId, queryText, relevanceScore, clicked = false) {
    this.feedback.push({
        userId,
        queryText,
        relevanceScore,
        clicked,
        timestamp: new Date()
    });

    // Recalculate aggregated score
    const recentFeedback = this.feedback.slice(-100); // Last 100 feedback entries
    const totalScore = recentFeedback.reduce((sum, f) => sum + f.relevanceScore, 0);
    this.aggregatedFeedbackScore = recentFeedback.length > 0 
        ? totalScore / recentFeedback.length 
        : 0;

    // Adjust relevance boost based on feedback
    if (this.aggregatedFeedbackScore > 0.5) {
        this.relevanceBoost = Math.min(2.0, this.relevanceBoost + 0.1);
    } else if (this.aggregatedFeedbackScore < -0.5) {
        this.relevanceBoost = Math.max(0.5, this.relevanceBoost - 0.1);
    }

    return this.save();
};

/**
 * Instance: Mark as stale for reindexing
 */
semanticIndexSchema.methods.markStale = function() {
    this.status = 'STALE';
    return this.save();
};

/**
 * Instance: Update embedding
 */
semanticIndexSchema.methods.updateEmbedding = async function(compositeVector, fragments = []) {
    this.compositeVector = compositeVector;
    this.vectorDimension = compositeVector.length;
    
    if (fragments.length > 0) {
        this.fragments = fragments;
    }
    
    this.status = 'INDEXED';
    this.indexedAt = new Date();
    this.lastError = null;
    this.retryCount = 0;
    
    return this.save();
};

/**
 * Instance: Record indexing failure
 */
semanticIndexSchema.methods.recordFailure = function(error) {
    this.status = 'FAILED';
    this.lastError = error.message || String(error);
    this.retryCount += 1;
    return this.save();
};

/**
 * Instance: Get retrieval-ready format for RAG
 */
semanticIndexSchema.methods.toRAGContext = function() {
    return {
        id: this._id,
        entityId: this.entityId,
        entityType: this.entityType,
        text: this.sourceText,
        metadata: {
            ...this.financialContext,
            topics: this.semanticMetadata?.primaryTopics || [],
            sentiment: this.semanticMetadata?.sentimentScore,
            riskLevel: this.financialContext?.riskLevel
        },
        score: this.qualityScore * this.relevanceBoost
    };
};

module.exports = mongoose.model('SemanticIndex', semanticIndexSchema);
