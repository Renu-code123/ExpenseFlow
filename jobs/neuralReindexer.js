const SemanticIndex = require('../models/SemanticIndex');
const searchIntelligence = require('../services/searchIntelligence');
const vectorMath = require('../utils/vectorMath');
const logger = require('../utils/structuredLogger');

/**
 * Neural Reindexer Job
 * Issue #796: Periodic refinement of vector weights based on user feedback.
 * Handles stale entry reindexing, weight optimization, and cluster recalculation.
 */
class NeuralReindexerJob {
    constructor() {
        this.isRunning = false;
        this.interval = null;
        this.config = {
            batchSize: 50,
            staleDays: 30,
            feedbackThreshold: 0.1,
            minFeedbackCount: 5,
            clusterUpdateInterval: 24 * 60 * 60 * 1000, // 24 hours
            reindexInterval: 60 * 60 * 1000, // 1 hour
            weightAdjustmentFactor: 0.1,
            maxRetries: 5
        };
        this.lastClusterUpdate = 0;
        this.stats = {
            totalReindexed: 0,
            totalWeightAdjustments: 0,
            totalFailures: 0,
            lastRunAt: null,
            lastRunDuration: 0
        };
    }

    /**
     * Start the neural reindexer job
     */
    start() {
        if (this.interval) {
            logger.warn('[NeuralReindexer] Already running');
            return;
        }

        logger.info('[NeuralReindexer] Starting neural reindexer job', {
            reindexInterval: this.config.reindexInterval
        });

        // Run immediately, then at interval
        this.run();
        this.interval = setInterval(() => this.run(), this.config.reindexInterval);
    }

    /**
     * Stop the neural reindexer job
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            logger.info('[NeuralReindexer] Stopped');
        }
    }

    /**
     * Main run method
     */
    async run() {
        if (this.isRunning) {
            logger.debug('[NeuralReindexer] Skipping run - already in progress');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            logger.info('[NeuralReindexer] Starting reindexing cycle');

            // Step 1: Process stale entries
            await this.processStaleEntries();

            // Step 2: Process pending entries
            await this.processPendingEntries();

            // Step 3: Process failed entries with retry
            await this.processFailedEntries();

            // Step 4: Adjust weights based on feedback
            await this.adjustWeightsFromFeedback();

            // Step 5: Update clusters if needed
            if (Date.now() - this.lastClusterUpdate > this.config.clusterUpdateInterval) {
                await this.updateSemanticClusters();
                this.lastClusterUpdate = Date.now();
            }

            // Step 6: Cleanup expired entries
            await this.cleanupExpiredEntries();

            this.stats.lastRunAt = new Date();
            this.stats.lastRunDuration = Date.now() - startTime;

            logger.info('[NeuralReindexer] Reindexing cycle complete', {
                duration: this.stats.lastRunDuration,
                stats: this.stats
            });

        } catch (error) {
            logger.error('[NeuralReindexer] Reindexing cycle failed', {
                error: error.message,
                stack: error.stack
            });
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Process stale entries that need reindexing
     */
    async processStaleEntries() {
        try {
            const staleEntries = await SemanticIndex.getStaleEntries(
                this.config.staleDays,
                this.config.batchSize
            );

            logger.info(`[NeuralReindexer] Found ${staleEntries.length} stale entries`);

            for (const entry of staleEntries) {
                try {
                    await this.reindexEntry(entry);
                    this.stats.totalReindexed++;
                } catch (error) {
                    logger.warn('[NeuralReindexer] Failed to reindex stale entry', {
                        entityId: entry.entityId,
                        error: error.message
                    });
                    this.stats.totalFailures++;
                }
            }
        } catch (error) {
            logger.error('[NeuralReindexer] Error processing stale entries', {
                error: error.message
            });
        }
    }

    /**
     * Process pending entries waiting for initial indexing
     */
    async processPendingEntries() {
        try {
            const pendingEntries = await SemanticIndex.getPendingEntries(
                this.config.batchSize
            );

            logger.info(`[NeuralReindexer] Found ${pendingEntries.length} pending entries`);

            for (const entry of pendingEntries) {
                try {
                    await this.indexNewEntry(entry);
                    this.stats.totalReindexed++;
                } catch (error) {
                    logger.warn('[NeuralReindexer] Failed to index pending entry', {
                        entityId: entry.entityId,
                        error: error.message
                    });
                    await entry.recordFailure(error);
                    this.stats.totalFailures++;
                }
            }
        } catch (error) {
            logger.error('[NeuralReindexer] Error processing pending entries', {
                error: error.message
            });
        }
    }

    /**
     * Process failed entries with exponential backoff
     */
    async processFailedEntries() {
        try {
            const failedEntries = await SemanticIndex.find({
                status: 'FAILED',
                retryCount: { $lt: this.config.maxRetries }
            })
            .sort({ retryCount: 1, updatedAt: 1 })
            .limit(Math.floor(this.config.batchSize / 2));

            logger.info(`[NeuralReindexer] Retrying ${failedEntries.length} failed entries`);

            for (const entry of failedEntries) {
                // Exponential backoff check
                const backoffMs = Math.pow(2, entry.retryCount) * 60000; // 2^n minutes
                const timeSinceUpdate = Date.now() - entry.updatedAt.getTime();
                
                if (timeSinceUpdate < backoffMs) {
                    continue;
                }

                try {
                    await this.indexNewEntry(entry);
                    this.stats.totalReindexed++;
                } catch (error) {
                    await entry.recordFailure(error);
                    this.stats.totalFailures++;
                }
            }
        } catch (error) {
            logger.error('[NeuralReindexer] Error processing failed entries', {
                error: error.message
            });
        }
    }

    /**
     * Reindex an existing entry
     */
    async reindexEntry(entry) {
        // Mark as reindexing
        entry.status = 'REINDEXING';
        await entry.save();

        // Regenerate embedding
        const compositeVector = await searchIntelligence.generateEmbedding(entry.sourceText);

        // Generate fragment embeddings if we have fragments
        const fragments = [];
        if (entry.fragments && entry.fragments.length > 0) {
            for (const fragment of entry.fragments) {
                const fragmentVector = await searchIntelligence.generateEmbedding(fragment.text);
                fragments.push({
                    ...fragment,
                    vector: fragmentVector
                });
            }
        }

        // Update entry
        await entry.updateEmbedding(compositeVector, fragments);

        logger.debug('[NeuralReindexer] Reindexed entry', { entityId: entry.entityId });
    }

    /**
     * Index a new entry
     */
    async indexNewEntry(entry) {
        const compositeVector = await searchIntelligence.generateEmbedding(entry.sourceText);
        await entry.updateEmbedding(compositeVector);
        
        logger.debug('[NeuralReindexer] Indexed new entry', { entityId: entry.entityId });
    }

    /**
     * Adjust relevance weights based on user feedback
     */
    async adjustWeightsFromFeedback() {
        try {
            // Find entries with significant feedback
            const entriesWithFeedback = await SemanticIndex.find({
                status: 'INDEXED',
                'feedback.0': { $exists: true },
                $expr: { $gte: [{ $size: '$feedback' }, this.config.minFeedbackCount] }
            })
            .limit(this.config.batchSize);

            logger.info(`[NeuralReindexer] Processing feedback for ${entriesWithFeedback.length} entries`);

            for (const entry of entriesWithFeedback) {
                try {
                    await this.adjustEntryWeights(entry);
                    this.stats.totalWeightAdjustments++;
                } catch (error) {
                    logger.warn('[NeuralReindexer] Failed to adjust weights', {
                        entityId: entry.entityId,
                        error: error.message
                    });
                }
            }
        } catch (error) {
            logger.error('[NeuralReindexer] Error adjusting weights', {
                error: error.message
            });
        }
    }

    /**
     * Adjust weights for a single entry based on its feedback
     */
    async adjustEntryWeights(entry) {
        const recentFeedback = entry.feedback.slice(-50);
        
        if (recentFeedback.length < this.config.minFeedbackCount) {
            return;
        }

        // Calculate weighted feedback score (recent feedback weighted more)
        let totalScore = 0;
        let totalWeight = 0;
        
        recentFeedback.forEach((fb, idx) => {
            const recencyWeight = (idx + 1) / recentFeedback.length; // More recent = higher weight
            const clickBonus = fb.clicked ? 0.2 : 0;
            totalScore += (fb.relevanceScore + clickBonus) * recencyWeight;
            totalWeight += recencyWeight;
        });

        const avgScore = totalScore / totalWeight;

        // Adjust relevance boost if feedback is significant
        if (Math.abs(avgScore) > this.config.feedbackThreshold) {
            const adjustment = avgScore * this.config.weightAdjustmentFactor;
            entry.relevanceBoost = Math.max(0.5, Math.min(2.0, entry.relevanceBoost + adjustment));
            
            // Update quality score based on consistent positive/negative feedback
            const positiveCount = recentFeedback.filter(f => f.relevanceScore > 0).length;
            const consistencyRatio = Math.abs(positiveCount / recentFeedback.length - 0.5) * 2;
            
            if (consistencyRatio > 0.7) {
                // Consistent feedback
                entry.qualityScore = Math.max(0.1, Math.min(1.0, entry.qualityScore + (avgScore > 0 ? 0.05 : -0.05)));
            }

            await entry.save();

            logger.debug('[NeuralReindexer] Adjusted entry weights', {
                entityId: entry.entityId,
                avgScore,
                newRelevanceBoost: entry.relevanceBoost,
                newQualityScore: entry.qualityScore
            });
        }
    }

    /**
     * Update semantic clusters for better organization
     */
    async updateSemanticClusters() {
        try {
            logger.info('[NeuralReindexer] Updating semantic clusters');

            // Get all workspaces with indexed entries
            const workspaces = await SemanticIndex.distinct('workspaceId', {
                status: 'INDEXED',
                workspaceId: { $ne: null }
            });

            for (const workspaceId of workspaces) {
                try {
                    await this.updateWorkspaceClusters(workspaceId);
                } catch (error) {
                    logger.warn('[NeuralReindexer] Failed to update clusters for workspace', {
                        workspaceId,
                        error: error.message
                    });
                }
            }

            logger.info('[NeuralReindexer] Cluster update complete', {
                workspacesProcessed: workspaces.length
            });
        } catch (error) {
            logger.error('[NeuralReindexer] Error updating clusters', {
                error: error.message
            });
        }
    }

    /**
     * Update clusters for a specific workspace
     */
    async updateWorkspaceClusters(workspaceId) {
        // Get all indexed entries for workspace
        const entries = await SemanticIndex.find({
            workspaceId,
            status: 'INDEXED',
            compositeVector: { $exists: true, $ne: [] }
        })
        .select('_id compositeVector entityType')
        .limit(1000);

        if (entries.length < 10) {
            return; // Not enough entries for meaningful clusters
        }

        // Extract vectors
        const vectors = entries.map(e => e.compositeVector).filter(v => v && v.length > 0);
        
        if (vectors.length < 10) {
            return;
        }

        // Determine optimal cluster count (heuristic)
        const k = Math.min(Math.ceil(Math.sqrt(vectors.length / 2)), 20);

        // Perform clustering
        const { centroids, assignments } = vectorMath.kMeansClustering(vectors, k);

        // Calculate cluster quality
        const silhouette = vectorMath.silhouetteScore(vectors, assignments);

        logger.debug('[NeuralReindexer] Clusters calculated', {
            workspaceId,
            entryCount: entries.length,
            clusterCount: k,
            silhouetteScore: silhouette
        });

        // Assign cluster IDs to entries
        const bulkOps = entries.map((entry, idx) => ({
            updateOne: {
                filter: { _id: entry._id },
                update: { 
                    $set: { 
                        clusterId: `${workspaceId}_cluster_${assignments[idx]}` 
                    } 
                }
            }
        }));

        if (bulkOps.length > 0) {
            await SemanticIndex.bulkWrite(bulkOps);
        }
    }

    /**
     * Cleanup expired and old entries
     */
    async cleanupExpiredEntries() {
        try {
            // Remove entries that have exceeded max retry count
            const permanentlyFailedResult = await SemanticIndex.deleteMany({
                status: 'FAILED',
                retryCount: { $gte: this.config.maxRetries }
            });

            // Remove very old entries without recent access
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            const staleResult = await SemanticIndex.deleteMany({
                status: 'INDEXED',
                lastAccessedAt: { $lt: sixMonthsAgo },
                'feedback.0': { $exists: false } // No feedback means low value
            });

            if (permanentlyFailedResult.deletedCount > 0 || staleResult.deletedCount > 0) {
                logger.info('[NeuralReindexer] Cleanup complete', {
                    permanentlyFailedDeleted: permanentlyFailedResult.deletedCount,
                    staleDeleted: staleResult.deletedCount
                });
            }
        } catch (error) {
            logger.error('[NeuralReindexer] Error during cleanup', {
                error: error.message
            });
        }
    }

    /**
     * Manually trigger reindexing for a specific entity
     */
    async reindexEntity(entityId) {
        const entry = await SemanticIndex.findOne({ entityId });
        
        if (!entry) {
            throw new Error(`Entity ${entityId} not found in semantic index`);
        }

        await this.reindexEntry(entry);
        return entry;
    }

    /**
     * Get job statistics
     */
    getStats() {
        return {
            ...this.stats,
            isRunning: this.isRunning,
            config: this.config
        };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('[NeuralReindexer] Configuration updated', { config: this.config });
    }
}

// Singleton instance
const neuralReindexer = new NeuralReindexerJob();

module.exports = neuralReindexer;
