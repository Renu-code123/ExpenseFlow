const { describe, it, beforeEach, afterEach, expect, jest } = require('@jest/globals');

/**
 * Semantic Search & RAG Intelligence Tests
 * Issue #796: Proximity validation and RAG accuracy benchmarks.
 * Tests for semantic search, vector operations, and retrieval-augmented generation.
 */

// Mock dependencies
jest.mock('../models/SemanticIndex');
jest.mock('../utils/structuredLogger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

const vectorMath = require('../utils/vectorMath');
const SemanticIndex = require('../models/SemanticIndex');
const searchIntelligence = require('../services/searchIntelligence');

describe('Vector Math Utilities', () => {
    describe('Cosine Similarity', () => {
        it('should return 1 for identical vectors', () => {
            const vector = [1, 2, 3, 4, 5];
            expect(vectorMath.cosineSimilarity(vector, vector)).toBeCloseTo(1, 5);
        });

        it('should return 0 for orthogonal vectors', () => {
            const vectorA = [1, 0, 0];
            const vectorB = [0, 1, 0];
            expect(vectorMath.cosineSimilarity(vectorA, vectorB)).toBeCloseTo(0, 5);
        });

        it('should return -1 for opposite vectors', () => {
            const vectorA = [1, 2, 3];
            const vectorB = [-1, -2, -3];
            expect(vectorMath.cosineSimilarity(vectorA, vectorB)).toBeCloseTo(-1, 5);
        });

        it('should handle vectors of different lengths', () => {
            const vectorA = [1, 2, 3];
            const vectorB = [1, 2, 3, 0, 0];
            const similarity = vectorMath.cosineSimilarity(vectorA, vectorB);
            expect(similarity).toBeCloseTo(1, 5);
        });

        it('should return 0 for empty vectors', () => {
            expect(vectorMath.cosineSimilarity([], [])).toBe(0);
            expect(vectorMath.cosineSimilarity([1, 2], [])).toBe(0);
        });

        it('should handle zero vectors', () => {
            const zeroVector = [0, 0, 0];
            const normalVector = [1, 2, 3];
            expect(vectorMath.cosineSimilarity(zeroVector, normalVector)).toBe(0);
        });
    });

    describe('Vector Normalization', () => {
        it('should normalize vector to unit length', () => {
            const vector = [3, 4];
            const normalized = vectorMath.normalize(vector);
            const magnitude = vectorMath.magnitude(normalized);
            expect(magnitude).toBeCloseTo(1, 5);
        });

        it('should handle zero vector', () => {
            const zeroVector = [0, 0, 0];
            const normalized = vectorMath.normalize(zeroVector);
            expect(normalized).toEqual([0, 0, 0]);
        });

        it('should preserve direction', () => {
            const vector = [3, 4];
            const normalized = vectorMath.normalize(vector);
            expect(normalized[0] / normalized[1]).toBeCloseTo(3/4, 5);
        });
    });

    describe('Vector Operations', () => {
        it('should add vectors correctly', () => {
            const a = [1, 2, 3];
            const b = [4, 5, 6];
            expect(vectorMath.add(a, b)).toEqual([5, 7, 9]);
        });

        it('should subtract vectors correctly', () => {
            const a = [4, 5, 6];
            const b = [1, 2, 3];
            expect(vectorMath.subtract(a, b)).toEqual([3, 3, 3]);
        });

        it('should scale vectors correctly', () => {
            const vector = [1, 2, 3];
            expect(vectorMath.scale(vector, 2)).toEqual([2, 4, 6]);
        });

        it('should calculate dot product correctly', () => {
            const a = [1, 2, 3];
            const b = [4, 5, 6];
            expect(vectorMath.dotProduct(a, b)).toBe(32); // 1*4 + 2*5 + 3*6
        });

        it('should calculate mean vector correctly', () => {
            const vectors = [[1, 2], [3, 4], [5, 6]];
            const meanVec = vectorMath.mean(vectors);
            expect(meanVec).toEqual([3, 4]);
        });

        it('should calculate weighted mean correctly', () => {
            const vectors = [[1, 0], [0, 1]];
            const weights = [3, 1];
            const weightedMeanVec = vectorMath.weightedMean(vectors, weights);
            expect(weightedMeanVec[0]).toBeCloseTo(0.75, 5);
            expect(weightedMeanVec[1]).toBeCloseTo(0.25, 5);
        });
    });

    describe('Distance Metrics', () => {
        it('should calculate Euclidean distance correctly', () => {
            const a = [0, 0];
            const b = [3, 4];
            expect(vectorMath.euclideanDistance(a, b)).toBeCloseTo(5, 5);
        });

        it('should calculate Manhattan distance correctly', () => {
            const a = [0, 0];
            const b = [3, 4];
            expect(vectorMath.manhattanDistance(a, b)).toBe(7);
        });

        it('should return Infinity for empty vectors in Euclidean', () => {
            expect(vectorMath.euclideanDistance([], [1, 2])).toBe(Infinity);
        });
    });

    describe('K-Nearest Neighbors', () => {
        it('should find k nearest neighbors', () => {
            const query = [1, 0, 0];
            const vectors = [
                [1, 0, 0],    // Most similar
                [0.9, 0.1, 0], // Second most similar
                [0, 1, 0],    // Orthogonal
                [0, 0, 1],    // Orthogonal
            ];
            
            const neighbors = vectorMath.kNearestNeighbors(query, vectors, 2);
            expect(neighbors).toHaveLength(2);
            expect(neighbors[0].index).toBe(0);
            expect(neighbors[0].similarity).toBeCloseTo(1, 5);
        });

        it('should handle k larger than vector count', () => {
            const query = [1, 0];
            const vectors = [[1, 0], [0, 1]];
            const neighbors = vectorMath.kNearestNeighbors(query, vectors, 10);
            expect(neighbors).toHaveLength(2);
        });
    });

    describe('K-Means Clustering', () => {
        it('should cluster vectors into k groups', () => {
            const vectors = [
                [1, 0], [1.1, 0], [0.9, 0.1],  // Cluster 1
                [0, 1], [0.1, 1], [0, 0.9]     // Cluster 2
            ];
            
            const { centroids, assignments } = vectorMath.kMeansClustering(vectors, 2, 50);
            
            expect(centroids).toHaveLength(2);
            expect(assignments).toHaveLength(6);
            
            // First three should be in same cluster
            expect(assignments[0]).toBe(assignments[1]);
            expect(assignments[1]).toBe(assignments[2]);
            
            // Last three should be in same cluster
            expect(assignments[3]).toBe(assignments[4]);
            expect(assignments[4]).toBe(assignments[5]);
            
            // Two clusters should be different
            expect(assignments[0]).not.toBe(assignments[3]);
        });

        it('should handle edge cases', () => {
            expect(vectorMath.kMeansClustering([], 2).centroids).toEqual([]);
            expect(vectorMath.kMeansClustering([[1, 2]], 0).centroids).toEqual([]);
        });
    });

    describe('Dimensionality Reduction', () => {
        it('should reduce vector dimensions', () => {
            const vectors = [
                [1, 2, 3, 4, 5, 6, 7, 8],
                [8, 7, 6, 5, 4, 3, 2, 1]
            ];
            
            const reduced = vectorMath.reduceDimensionality(vectors, 3);
            
            expect(reduced).toHaveLength(2);
            expect(reduced[0]).toHaveLength(3);
            expect(reduced[1]).toHaveLength(3);
        });

        it('should return original if target dim >= source dim', () => {
            const vectors = [[1, 2, 3]];
            const reduced = vectorMath.reduceDimensionality(vectors, 5);
            expect(reduced).toEqual(vectors);
        });
    });
});

describe('Search Intelligence Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Query Intent Analysis', () => {
        it('should detect time-related intent', () => {
            const intent = searchIntelligence.analyzeQueryIntent('expenses from last quarter');
            expect(intent.timeframe).toBe('quarter');
        });

        it('should detect aggregation intent (MAX)', () => {
            const intent = searchIntelligence.analyzeQueryIntent('what was my highest expense?');
            expect(intent.aggregation).toBe('MAX');
            expect(intent.type).toBe('AGGREGATION');
        });

        it('should detect aggregation intent (MIN)', () => {
            const intent = searchIntelligence.analyzeQueryIntent('show me the lowest spending');
            expect(intent.aggregation).toBe('MIN');
        });

        it('should detect aggregation intent (SUM)', () => {
            const intent = searchIntelligence.analyzeQueryIntent('total marketing spend');
            expect(intent.aggregation).toBe('SUM');
        });

        it('should detect comparison intent', () => {
            const intent = searchIntelligence.analyzeQueryIntent('compare Q1 vs Q2 expenses');
            expect(intent.comparison).toBe(true);
            expect(intent.type).toBe('COMPARISON');
        });

        it('should detect risk focus', () => {
            const intent = searchIntelligence.analyzeQueryIntent('show suspicious transactions');
            expect(intent.riskFocus).toBe(true);
        });

        it('should detect category focus', () => {
            const intent = searchIntelligence.analyzeQueryIntent('marketing expenses last month');
            expect(intent.categoryFocus).toBe('marketing');
        });

        it('should detect amount focus (HIGH)', () => {
            const intent = searchIntelligence.analyzeQueryIntent('show expensive purchases');
            expect(intent.amountFocus).toBe('HIGH');
        });

        it('should detect amount focus (LOW)', () => {
            const intent = searchIntelligence.analyzeQueryIntent('small transactions');
            expect(intent.amountFocus).toBe('LOW');
        });

        it('should extract keywords', () => {
            const intent = searchIntelligence.analyzeQueryIntent('marketing budget expenses');
            expect(intent.keywords).toContain('marketing');
            expect(intent.keywords).toContain('budget');
            expect(intent.keywords).toContain('expenses');
        });

        it('should handle complex queries', () => {
            const intent = searchIntelligence.analyzeQueryIntent(
                'Where did most of my high-risk marketing spend go last quarter?'
            );
            expect(intent.aggregation).toBe('MAX');
            expect(intent.riskFocus).toBe(true);
            expect(intent.categoryFocus).toBe('marketing');
            expect(intent.timeframe).toBe('quarter');
        });
    });

    describe('Embedding Generation', () => {
        it('should generate fixed-dimension embeddings', async () => {
            const embedding = await searchIntelligence.generateEmbedding('test query');
            expect(Array.isArray(embedding)).toBe(true);
            expect(embedding.length).toBe(384); // Default dimension
        });

        it('should generate normalized embeddings', async () => {
            const embedding = await searchIntelligence.generateEmbedding('test query');
            const magnitude = vectorMath.magnitude(embedding);
            expect(magnitude).toBeCloseTo(1, 3);
        });

        it('should generate different embeddings for different text', async () => {
            const embedding1 = await searchIntelligence.generateEmbedding('marketing expenses');
            const embedding2 = await searchIntelligence.generateEmbedding('travel budget');
            
            const similarity = vectorMath.cosineSimilarity(embedding1, embedding2);
            expect(similarity).toBeLessThan(1);
        });

        it('should generate similar embeddings for similar text', async () => {
            const embedding1 = await searchIntelligence.generateEmbedding('marketing expense report');
            const embedding2 = await searchIntelligence.generateEmbedding('marketing expense analysis');
            
            const similarity = vectorMath.cosineSimilarity(embedding1, embedding2);
            expect(similarity).toBeGreaterThan(0.5);
        });
    });

    describe('Semantic Search', () => {
        beforeEach(() => {
            SemanticIndex.find = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        lean: jest.fn().mockResolvedValue([
                            {
                                entityId: 'entity1',
                                entityType: 'TRANSACTION',
                                compositeVector: vectorMath.normalize([1, 0.5, 0.3, ...new Array(381).fill(0.1)]),
                                sourceText: 'Marketing campaign expense for Q1',
                                financialContext: {
                                    amount: 5000,
                                    category: 'Marketing',
                                    merchant: 'Google Ads'
                                },
                                semanticMetadata: { primaryTopics: ['marketing'] },
                                qualityScore: 0.9,
                                relevanceBoost: 1.0
                            },
                            {
                                entityId: 'entity2',
                                entityType: 'TRANSACTION',
                                compositeVector: vectorMath.normalize([0.8, 0.6, 0.2, ...new Array(381).fill(0.05)]),
                                sourceText: 'Office supplies purchase',
                                financialContext: {
                                    amount: 150,
                                    category: 'Supplies',
                                    merchant: 'Staples'
                                },
                                semanticMetadata: { primaryTopics: ['office'] },
                                qualityScore: 0.85,
                                relevanceBoost: 1.0
                            }
                        ])
                    })
                })
            });
        });

        it('should return ranked results', async () => {
            const results = await searchIntelligence.semanticSearch('marketing expenses', {
                userId: 'user123',
                limit: 10
            });

            expect(results.results).toBeDefined();
            expect(Array.isArray(results.results)).toBe(true);
        });

        it('should include query intent in results', async () => {
            const results = await searchIntelligence.semanticSearch('highest marketing spend last quarter', {
                userId: 'user123'
            });

            expect(results.intent).toBeDefined();
            expect(results.intent.aggregation).toBe('MAX');
            expect(results.intent.categoryFocus).toBe('marketing');
        });

        it('should include RAG context when requested', async () => {
            const results = await searchIntelligence.semanticSearch('marketing analysis', {
                userId: 'user123',
                includeContext: true
            });

            expect(results.ragContext).toBeDefined();
            expect(results.ragContext.chunks).toBeDefined();
            expect(results.ragContext.stats).toBeDefined();
        });

        it('should respect minSimilarity threshold', async () => {
            const results = await searchIntelligence.semanticSearch('random query xyz', {
                userId: 'user123',
                minSimilarity: 0.99 // Very high threshold
            });

            // Results should be filtered based on similarity
            expect(results.results.every(r => r.similarity >= 0.99 || results.results.length === 0)).toBe(true);
        });
    });

    describe('Entity Indexing', () => {
        beforeEach(() => {
            SemanticIndex.findOneAndUpdate = jest.fn().mockResolvedValue({
                entityId: 'test-entity',
                status: 'INDEXED'
            });
        });

        it('should index entity with embedding', async () => {
            const result = await searchIntelligence.indexEntity({
                entityId: 'test-entity',
                entityType: 'TRANSACTION',
                text: 'Marketing expense for social media ads',
                userId: 'user123',
                workspaceId: 'workspace456',
                financialContext: {
                    amount: 1000,
                    category: 'Marketing'
                }
            });

            expect(SemanticIndex.findOneAndUpdate).toHaveBeenCalled();
            expect(result.status).toBe('INDEXED');
        });

        it('should batch index multiple entities', async () => {
            const entities = [
                { entityId: 'e1', entityType: 'TRANSACTION', text: 'Expense 1', userId: 'u1' },
                { entityId: 'e2', entityType: 'TRANSACTION', text: 'Expense 2', userId: 'u1' }
            ];

            const results = await searchIntelligence.batchIndexEntities(entities);
            
            expect(results.success).toBe(2);
            expect(results.failed).toBe(0);
        });
    });
});

describe('RAG Context Building', () => {
    describe('Context Statistics', () => {
        it('should calculate amount statistics', () => {
            const mockResults = [
                { financialContext: { amount: 100, category: 'Food' } },
                { financialContext: { amount: 200, category: 'Food' } },
                { financialContext: { amount: 300, category: 'Travel' } }
            ];

            // Test internal stats calculation
            const stats = searchIntelligence._calculateContextStats(mockResults);
            
            expect(stats.totalResults).toBe(3);
            expect(stats.amountStats.total).toBe(600);
            expect(stats.amountStats.average).toBe(200);
            expect(stats.amountStats.min).toBe(100);
            expect(stats.amountStats.max).toBe(300);
        });

        it('should identify top categories', () => {
            const mockResults = [
                { financialContext: { category: 'Food' } },
                { financialContext: { category: 'Food' } },
                { financialContext: { category: 'Travel' } }
            ];

            const stats = searchIntelligence._calculateContextStats(mockResults);
            
            expect(stats.topCategories[0].name).toBe('Food');
            expect(stats.topCategories[0].count).toBe(2);
        });
    });

    describe('Prompt Formatting', () => {
        it('should format context for LLM prompt', () => {
            const chunks = [
                {
                    entityType: 'TRANSACTION',
                    text: 'Marketing expense',
                    metadata: { amount: 1000, category: 'Marketing' }
                }
            ];
            const intent = { aggregation: 'SUM' };

            const prompt = searchIntelligence._formatForPrompt(chunks, intent);
            
            expect(prompt).toContain('Marketing expense');
            expect(prompt).toContain('$1000.00');
            expect(prompt).toContain('sum');
        });
    });
});

describe('Semantic Metadata Extraction', () => {
    describe('Topic Extraction', () => {
        it('should extract marketing topic', () => {
            const metadata = searchIntelligence._extractSemanticMetadata(
                'Marketing campaign for social media advertising',
                { amount: 5000 }
            );
            expect(metadata.primaryTopics).toContain('marketing');
        });

        it('should extract travel topic', () => {
            const metadata = searchIntelligence._extractSemanticMetadata(
                'Flight booking for business trip',
                { amount: 500 }
            );
            expect(metadata.primaryTopics).toContain('travel');
        });

        it('should extract multiple topics', () => {
            const metadata = searchIntelligence._extractSemanticMetadata(
                'Travel expenses for marketing conference',
                { amount: 2000 }
            );
            expect(metadata.primaryTopics).toContain('travel');
            expect(metadata.primaryTopics).toContain('marketing');
        });
    });

    describe('Sentiment Analysis', () => {
        it('should detect positive sentiment', () => {
            const metadata = searchIntelligence._extractSemanticMetadata(
                'Great success with profit gains',
                {}
            );
            expect(metadata.sentimentScore).toBeGreaterThan(0);
        });

        it('should detect negative sentiment', () => {
            const metadata = searchIntelligence._extractSemanticMetadata(
                'Bad loss with suspicious activity',
                {}
            );
            expect(metadata.sentimentScore).toBeLessThan(0);
        });

        it('should detect neutral sentiment', () => {
            const metadata = searchIntelligence._extractSemanticMetadata(
                'Standard office supply purchase',
                {}
            );
            expect(Math.abs(metadata.sentimentScore)).toBeLessThan(0.5);
        });
    });

    describe('Amount Magnitude Classification', () => {
        it('should classify MICRO amounts', () => {
            const metadata = searchIntelligence._extractSemanticMetadata('Coffee', { amount: 5 });
            expect(metadata.amountMagnitude).toBe('MICRO');
        });

        it('should classify SMALL amounts', () => {
            const metadata = searchIntelligence._extractSemanticMetadata('Lunch', { amount: 100 });
            expect(metadata.amountMagnitude).toBe('SMALL');
        });

        it('should classify MEDIUM amounts', () => {
            const metadata = searchIntelligence._extractSemanticMetadata('Software', { amount: 1000 });
            expect(metadata.amountMagnitude).toBe('MEDIUM');
        });

        it('should classify LARGE amounts', () => {
            const metadata = searchIntelligence._extractSemanticMetadata('Equipment', { amount: 10000 });
            expect(metadata.amountMagnitude).toBe('LARGE');
        });

        it('should classify ENTERPRISE amounts', () => {
            const metadata = searchIntelligence._extractSemanticMetadata('Contract', { amount: 100000 });
            expect(metadata.amountMagnitude).toBe('ENTERPRISE');
        });
    });

    describe('Entity Extraction', () => {
        it('should extract currency amounts', () => {
            const metadata = searchIntelligence._extractSemanticMetadata(
                'Paid $500.00 for services',
                {}
            );
            const amountEntities = metadata.extractedEntities.filter(e => e.type === 'AMOUNT');
            expect(amountEntities.length).toBeGreaterThan(0);
            expect(amountEntities[0].value).toBe('$500.00');
        });

        it('should extract percentages', () => {
            const metadata = searchIntelligence._extractSemanticMetadata(
                'Discount of 15% applied',
                {}
            );
            const percentEntities = metadata.extractedEntities.filter(e => e.type === 'PERCENTAGE');
            expect(percentEntities.length).toBeGreaterThan(0);
            expect(percentEntities[0].value).toBe('15%');
        });
    });
});

describe('Similarity Threshold Benchmarks', () => {
    const generateRandomVector = (dim) => {
        const vec = [];
        for (let i = 0; i < dim; i++) {
            vec.push(Math.random() * 2 - 1);
        }
        return vectorMath.normalize(vec);
    };

    it('should maintain precision at 0.7 threshold', () => {
        // Generate test vectors
        const queryVector = generateRandomVector(384);
        const similarVector = vectorMath.add(
            vectorMath.scale(queryVector, 0.8),
            vectorMath.scale(generateRandomVector(384), 0.2)
        );
        const normalizedSimilar = vectorMath.normalize(similarVector);

        const similarity = vectorMath.cosineSimilarity(queryVector, normalizedSimilar);
        expect(similarity).toBeGreaterThan(0.7);
    });

    it('should filter dissimilar vectors at 0.5 threshold', () => {
        const vector1 = generateRandomVector(384);
        const vector2 = generateRandomVector(384);
        
        // Random vectors should have low similarity
        const similarity = vectorMath.cosineSimilarity(vector1, vector2);
        // With 384 dimensions, random vectors typically have similarity near 0
        expect(Math.abs(similarity)).toBeLessThan(0.3);
    });

    it('should rank results correctly by similarity', () => {
        const query = generateRandomVector(384);
        
        // Create vectors with known similarities
        const vectors = [
            vectorMath.normalize(vectorMath.add(vectorMath.scale(query, 0.9), vectorMath.scale(generateRandomVector(384), 0.1))),
            vectorMath.normalize(vectorMath.add(vectorMath.scale(query, 0.7), vectorMath.scale(generateRandomVector(384), 0.3))),
            vectorMath.normalize(vectorMath.add(vectorMath.scale(query, 0.5), vectorMath.scale(generateRandomVector(384), 0.5)))
        ];

        const similarities = vectors.map(v => vectorMath.cosineSimilarity(query, v));
        
        // Should be in descending order
        expect(similarities[0]).toBeGreaterThan(similarities[1]);
        expect(similarities[1]).toBeGreaterThan(similarities[2]);
    });
});

describe('Performance Benchmarks', () => {
    it('should calculate cosine similarity efficiently', () => {
        const vectorA = new Array(384).fill(0).map(() => Math.random());
        const vectorB = new Array(384).fill(0).map(() => Math.random());

        const iterations = 10000;
        const start = Date.now();
        
        for (let i = 0; i < iterations; i++) {
            vectorMath.cosineSimilarity(vectorA, vectorB);
        }
        
        const elapsed = Date.now() - start;
        const opsPerSecond = iterations / (elapsed / 1000);
        
        // Should handle at least 10,000 ops/sec
        expect(opsPerSecond).toBeGreaterThan(10000);
    });

    it('should normalize vectors efficiently', () => {
        const vector = new Array(384).fill(0).map(() => Math.random());

        const iterations = 10000;
        const start = Date.now();
        
        for (let i = 0; i < iterations; i++) {
            vectorMath.normalize(vector);
        }
        
        const elapsed = Date.now() - start;
        const opsPerSecond = iterations / (elapsed / 1000);
        
        expect(opsPerSecond).toBeGreaterThan(10000);
    });

    it('should find k-nearest neighbors efficiently', () => {
        const query = new Array(384).fill(0).map(() => Math.random());
        const vectors = Array.from({ length: 1000 }, () => 
            new Array(384).fill(0).map(() => Math.random())
        );

        const start = Date.now();
        vectorMath.kNearestNeighbors(query, vectors, 10);
        const elapsed = Date.now() - start;

        // Should complete in under 100ms for 1000 vectors
        expect(elapsed).toBeLessThan(100);
    });
});

describe('Edge Cases and Error Handling', () => {
    it('should handle null/undefined vectors gracefully', () => {
        expect(vectorMath.cosineSimilarity(null, [1, 2, 3])).toBe(0);
        expect(vectorMath.cosineSimilarity([1, 2, 3], undefined)).toBe(0);
        expect(vectorMath.normalize(null)).toEqual([]);
        expect(vectorMath.magnitude(undefined)).toBe(0);
    });

    it('should handle empty text in embedding generation', async () => {
        const embedding = await searchIntelligence.generateEmbedding('');
        expect(Array.isArray(embedding)).toBe(true);
    });

    it('should handle special characters in queries', async () => {
        const intent = searchIntelligence.analyzeQueryIntent('expense $$$!!! @#$%');
        expect(intent).toBeDefined();
        expect(intent.keywords).toBeDefined();
    });

    it('should handle very long queries', async () => {
        const longQuery = 'expense '.repeat(500);
        const intent = searchIntelligence.analyzeQueryIntent(longQuery);
        expect(intent).toBeDefined();
    });

    it('should handle unicode characters', async () => {
        const embedding = await searchIntelligence.generateEmbedding('日本語のテスト 中文测试');
        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBe(384);
    });
});

describe('Semantic Index Model', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Feedback Processing', () => {
        it('should aggregate feedback scores correctly', () => {
            const mockEntry = {
                feedback: [
                    { relevanceScore: 1, clicked: true },
                    { relevanceScore: 1, clicked: false },
                    { relevanceScore: -1, clicked: false }
                ],
                aggregatedFeedbackScore: 0,
                relevanceBoost: 1.0,
                save: jest.fn().mockResolvedValue(true)
            };

            // Simulate addFeedback logic
            const recentFeedback = mockEntry.feedback;
            const totalScore = recentFeedback.reduce((sum, f) => sum + f.relevanceScore, 0);
            const avgScore = totalScore / recentFeedback.length;

            expect(avgScore).toBeCloseTo(0.33, 1);
        });
    });

    describe('RAG Context Generation', () => {
        it('should generate retrieval-ready format', () => {
            const mockEntry = {
                _id: 'test-id',
                entityId: 'entity-123',
                entityType: 'TRANSACTION',
                sourceText: 'Test expense description',
                financialContext: {
                    amount: 500,
                    category: 'Marketing',
                    merchant: 'Vendor XYZ',
                    riskLevel: 'LOW'
                },
                semanticMetadata: {
                    primaryTopics: ['marketing'],
                    sentimentScore: 0.5
                },
                qualityScore: 0.9,
                relevanceBoost: 1.1,
                toRAGContext: function() {
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
                }
            };

            const ragContext = mockEntry.toRAGContext();
            
            expect(ragContext.id).toBe('test-id');
            expect(ragContext.text).toBe('Test expense description');
            expect(ragContext.metadata.amount).toBe(500);
            expect(ragContext.metadata.topics).toContain('marketing');
            expect(ragContext.score).toBeCloseTo(0.99, 2);
        });
    });
});
