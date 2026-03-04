/**
 * Vector Math Utilities
 * Issue #796: Cosine similarity and dimensionality reduction utilities.
 * Core mathematical operations for semantic search and vector space operations.
 */

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vectorA - First vector
 * @param {number[]} vectorB - Second vector
 * @returns {number} Similarity score between -1 and 1
 */
function cosineSimilarity(vectorA, vectorB) {
    if (!vectorA || !vectorB || vectorA.length === 0 || vectorB.length === 0) {
        return 0;
    }

    // Handle dimension mismatch by zero-padding
    const maxLen = Math.max(vectorA.length, vectorB.length);
    const a = vectorA.length < maxLen 
        ? [...vectorA, ...new Array(maxLen - vectorA.length).fill(0)]
        : vectorA;
    const b = vectorB.length < maxLen 
        ? [...vectorB, ...new Array(maxLen - vectorB.length).fill(0)]
        : vectorB;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < maxLen; i++) {
        dotProduct += a[i] * b[i];
        magnitudeA += a[i] * a[i];
        magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Calculate Euclidean distance between two vectors
 * @param {number[]} vectorA - First vector
 * @param {number[]} vectorB - Second vector
 * @returns {number} Euclidean distance
 */
function euclideanDistance(vectorA, vectorB) {
    if (!vectorA || !vectorB || vectorA.length === 0 || vectorB.length === 0) {
        return Infinity;
    }

    const maxLen = Math.max(vectorA.length, vectorB.length);
    let sum = 0;

    for (let i = 0; i < maxLen; i++) {
        const a = vectorA[i] || 0;
        const b = vectorB[i] || 0;
        sum += (a - b) * (a - b);
    }

    return Math.sqrt(sum);
}

/**
 * Calculate Manhattan distance between two vectors
 * @param {number[]} vectorA - First vector
 * @param {number[]} vectorB - Second vector
 * @returns {number} Manhattan distance
 */
function manhattanDistance(vectorA, vectorB) {
    if (!vectorA || !vectorB) {
        return Infinity;
    }

    const maxLen = Math.max(vectorA.length, vectorB.length);
    let sum = 0;

    for (let i = 0; i < maxLen; i++) {
        const a = vectorA[i] || 0;
        const b = vectorB[i] || 0;
        sum += Math.abs(a - b);
    }

    return sum;
}

/**
 * Normalize a vector to unit length
 * @param {number[]} vector - Input vector
 * @returns {number[]} Normalized vector
 */
function normalize(vector) {
    if (!vector || vector.length === 0) {
        return [];
    }

    let magnitude = 0;
    for (let i = 0; i < vector.length; i++) {
        magnitude += vector[i] * vector[i];
    }
    magnitude = Math.sqrt(magnitude);

    if (magnitude === 0) {
        return new Array(vector.length).fill(0);
    }

    return vector.map(v => v / magnitude);
}

/**
 * Calculate the magnitude (L2 norm) of a vector
 * @param {number[]} vector - Input vector
 * @returns {number} Magnitude
 */
function magnitude(vector) {
    if (!vector || vector.length === 0) {
        return 0;
    }

    let sum = 0;
    for (let i = 0; i < vector.length; i++) {
        sum += vector[i] * vector[i];
    }

    return Math.sqrt(sum);
}

/**
 * Add two vectors element-wise
 * @param {number[]} vectorA - First vector
 * @param {number[]} vectorB - Second vector
 * @returns {number[]} Sum vector
 */
function add(vectorA, vectorB) {
    const maxLen = Math.max(vectorA?.length || 0, vectorB?.length || 0);
    const result = new Array(maxLen);

    for (let i = 0; i < maxLen; i++) {
        result[i] = (vectorA?.[i] || 0) + (vectorB?.[i] || 0);
    }

    return result;
}

/**
 * Subtract vectorB from vectorA element-wise
 * @param {number[]} vectorA - First vector
 * @param {number[]} vectorB - Second vector
 * @returns {number[]} Difference vector
 */
function subtract(vectorA, vectorB) {
    const maxLen = Math.max(vectorA?.length || 0, vectorB?.length || 0);
    const result = new Array(maxLen);

    for (let i = 0; i < maxLen; i++) {
        result[i] = (vectorA?.[i] || 0) - (vectorB?.[i] || 0);
    }

    return result;
}

/**
 * Multiply vector by scalar
 * @param {number[]} vector - Input vector
 * @param {number} scalar - Scalar value
 * @returns {number[]} Scaled vector
 */
function scale(vector, scalar) {
    if (!vector) return [];
    return vector.map(v => v * scalar);
}

/**
 * Calculate dot product of two vectors
 * @param {number[]} vectorA - First vector
 * @param {number[]} vectorB - Second vector
 * @returns {number} Dot product
 */
function dotProduct(vectorA, vectorB) {
    if (!vectorA || !vectorB) {
        return 0;
    }

    const len = Math.min(vectorA.length, vectorB.length);
    let result = 0;

    for (let i = 0; i < len; i++) {
        result += vectorA[i] * vectorB[i];
    }

    return result;
}

/**
 * Calculate element-wise product (Hadamard product)
 * @param {number[]} vectorA - First vector
 * @param {number[]} vectorB - Second vector
 * @returns {number[]} Element-wise product
 */
function hadamardProduct(vectorA, vectorB) {
    if (!vectorA || !vectorB) return [];
    
    const len = Math.min(vectorA.length, vectorB.length);
    const result = new Array(len);

    for (let i = 0; i < len; i++) {
        result[i] = vectorA[i] * vectorB[i];
    }

    return result;
}

/**
 * Calculate mean vector from array of vectors
 * @param {number[][]} vectors - Array of vectors
 * @returns {number[]} Mean vector
 */
function mean(vectors) {
    if (!vectors || vectors.length === 0) {
        return [];
    }

    const dimension = Math.max(...vectors.map(v => v?.length || 0));
    const result = new Array(dimension).fill(0);

    for (const vector of vectors) {
        if (!vector) continue;
        for (let i = 0; i < vector.length; i++) {
            result[i] += vector[i];
        }
    }

    return result.map(v => v / vectors.length);
}

/**
 * Calculate weighted mean vector
 * @param {number[][]} vectors - Array of vectors
 * @param {number[]} weights - Corresponding weights
 * @returns {number[]} Weighted mean vector
 */
function weightedMean(vectors, weights) {
    if (!vectors || vectors.length === 0 || !weights || weights.length === 0) {
        return [];
    }

    const dimension = Math.max(...vectors.map(v => v?.length || 0));
    const result = new Array(dimension).fill(0);
    let totalWeight = 0;

    for (let i = 0; i < vectors.length; i++) {
        const vector = vectors[i];
        const weight = weights[i] || 0;
        
        if (!vector) continue;
        
        totalWeight += weight;
        for (let j = 0; j < vector.length; j++) {
            result[j] += vector[j] * weight;
        }
    }

    if (totalWeight === 0) {
        return result;
    }

    return result.map(v => v / totalWeight);
}

/**
 * Principal Component Analysis (simplified)
 * Reduces dimensionality while preserving variance
 * @param {number[][]} vectors - Array of vectors
 * @param {number} targetDimension - Target dimension
 * @returns {number[][]} Reduced vectors
 */
function reduceDimensionality(vectors, targetDimension) {
    if (!vectors || vectors.length === 0) {
        return [];
    }

    const sourceDimension = vectors[0]?.length || 0;
    
    if (targetDimension >= sourceDimension) {
        return vectors;
    }

    // Simplified random projection (fast approximation of PCA)
    // Generate random projection matrix
    const projectionMatrix = generateRandomProjection(sourceDimension, targetDimension);

    // Project each vector
    return vectors.map(vector => {
        if (!vector) return new Array(targetDimension).fill(0);
        return projectVector(vector, projectionMatrix);
    });
}

/**
 * Generate random projection matrix (Johnson-Lindenstrauss lemma)
 * @param {number} sourceDim - Source dimension
 * @param {number} targetDim - Target dimension
 * @returns {number[][]} Projection matrix
 */
function generateRandomProjection(sourceDim, targetDim) {
    const matrix = [];
    const scale = 1 / Math.sqrt(targetDim);

    for (let i = 0; i < targetDim; i++) {
        const row = [];
        for (let j = 0; j < sourceDim; j++) {
            // Random values from {-1, 0, 1} with probabilities {1/6, 2/3, 1/6}
            const rand = Math.random();
            if (rand < 1/6) {
                row.push(-scale * Math.sqrt(3));
            } else if (rand > 5/6) {
                row.push(scale * Math.sqrt(3));
            } else {
                row.push(0);
            }
        }
        matrix.push(row);
    }

    return matrix;
}

/**
 * Project vector using projection matrix
 * @param {number[]} vector - Input vector
 * @param {number[][]} matrix - Projection matrix
 * @returns {number[]} Projected vector
 */
function projectVector(vector, matrix) {
    return matrix.map(row => {
        let sum = 0;
        for (let i = 0; i < row.length && i < vector.length; i++) {
            sum += row[i] * vector[i];
        }
        return sum;
    });
}

/**
 * Calculate variance of vectors along each dimension
 * @param {number[][]} vectors - Array of vectors
 * @returns {number[]} Variance per dimension
 */
function variance(vectors) {
    if (!vectors || vectors.length === 0) {
        return [];
    }

    const meanVec = mean(vectors);
    const dimension = meanVec.length;
    const result = new Array(dimension).fill(0);

    for (const vector of vectors) {
        if (!vector) continue;
        for (let i = 0; i < dimension; i++) {
            const diff = (vector[i] || 0) - meanVec[i];
            result[i] += diff * diff;
        }
    }

    return result.map(v => v / vectors.length);
}

/**
 * Find k nearest neighbors using cosine similarity
 * @param {number[]} queryVector - Query vector
 * @param {number[][]} vectors - Array of candidate vectors
 * @param {number} k - Number of neighbors to find
 * @returns {Array<{index: number, similarity: number}>} k nearest neighbors
 */
function kNearestNeighbors(queryVector, vectors, k) {
    if (!queryVector || !vectors || vectors.length === 0) {
        return [];
    }

    const similarities = vectors.map((vector, index) => ({
        index,
        similarity: cosineSimilarity(queryVector, vector)
    }));

    similarities.sort((a, b) => b.similarity - a.similarity);

    return similarities.slice(0, k);
}

/**
 * Cluster vectors using k-means (simplified)
 * @param {number[][]} vectors - Array of vectors
 * @param {number} k - Number of clusters
 * @param {number} maxIterations - Maximum iterations
 * @returns {Object} Clustering result with centroids and assignments
 */
function kMeansClustering(vectors, k, maxIterations = 100) {
    if (!vectors || vectors.length === 0 || k <= 0) {
        return { centroids: [], assignments: [] };
    }

    const n = vectors.length;
    k = Math.min(k, n);

    // Initialize centroids randomly
    const centroidIndices = new Set();
    while (centroidIndices.size < k) {
        centroidIndices.add(Math.floor(Math.random() * n));
    }
    let centroids = Array.from(centroidIndices).map(i => [...(vectors[i] || [])]);

    let assignments = new Array(n).fill(0);
    
    for (let iter = 0; iter < maxIterations; iter++) {
        // Assign vectors to nearest centroid
        const newAssignments = vectors.map(vector => {
            let bestCluster = 0;
            let bestSimilarity = -Infinity;

            for (let c = 0; c < k; c++) {
                const sim = cosineSimilarity(vector, centroids[c]);
                if (sim > bestSimilarity) {
                    bestSimilarity = sim;
                    bestCluster = c;
                }
            }

            return bestCluster;
        });

        // Check for convergence
        const changed = newAssignments.some((a, i) => a !== assignments[i]);
        assignments = newAssignments;

        if (!changed) {
            break;
        }

        // Update centroids
        const clusterVectors = Array.from({ length: k }, () => []);
        for (let i = 0; i < n; i++) {
            clusterVectors[assignments[i]].push(vectors[i]);
        }

        centroids = clusterVectors.map((vecs, c) => 
            vecs.length > 0 ? normalize(mean(vecs)) : centroids[c]
        );
    }

    return { centroids, assignments };
}

/**
 * Calculate silhouette score for clustering quality
 * @param {number[][]} vectors - Array of vectors
 * @param {number[]} assignments - Cluster assignments
 * @returns {number} Silhouette score (-1 to 1)
 */
function silhouetteScore(vectors, assignments) {
    if (!vectors || vectors.length < 2 || !assignments) {
        return 0;
    }

    const n = vectors.length;
    let totalScore = 0;

    for (let i = 0; i < n; i++) {
        const cluster = assignments[i];
        
        // Calculate a(i) - average distance to same cluster
        let sameClusterDist = 0;
        let sameClusterCount = 0;
        
        // Calculate b(i) - average distance to nearest other cluster
        const otherClusterDists = {};

        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            
            const dist = 1 - cosineSimilarity(vectors[i], vectors[j]);
            
            if (assignments[j] === cluster) {
                sameClusterDist += dist;
                sameClusterCount++;
            } else {
                const otherCluster = assignments[j];
                otherClusterDists[otherCluster] = otherClusterDists[otherCluster] || { sum: 0, count: 0 };
                otherClusterDists[otherCluster].sum += dist;
                otherClusterDists[otherCluster].count++;
            }
        }

        const a = sameClusterCount > 0 ? sameClusterDist / sameClusterCount : 0;
        
        let b = Infinity;
        for (const clusterData of Object.values(otherClusterDists)) {
            if (clusterData.count > 0) {
                const avgDist = clusterData.sum / clusterData.count;
                b = Math.min(b, avgDist);
            }
        }
        
        if (b === Infinity) b = 0;

        const s = Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
        totalScore += s;
    }

    return totalScore / n;
}

/**
 * Soft cosine similarity using term correlation matrix
 * @param {number[]} vectorA - First vector
 * @param {number[]} vectorB - Second vector
 * @param {number[][]} correlationMatrix - Term correlation matrix (optional)
 * @returns {number} Soft cosine similarity
 */
function softCosineSimilarity(vectorA, vectorB, correlationMatrix = null) {
    if (!vectorA || !vectorB) {
        return 0;
    }

    // If no correlation matrix, fall back to regular cosine
    if (!correlationMatrix) {
        return cosineSimilarity(vectorA, vectorB);
    }

    const dim = Math.max(vectorA.length, vectorB.length);
    let numerator = 0;
    let denomA = 0;
    let denomB = 0;

    for (let i = 0; i < dim; i++) {
        for (let j = 0; j < dim; j++) {
            const corr = correlationMatrix[i]?.[j] || (i === j ? 1 : 0);
            const ai = vectorA[i] || 0;
            const aj = vectorA[j] || 0;
            const bi = vectorB[i] || 0;
            const bj = vectorB[j] || 0;

            numerator += corr * ai * bj;
            denomA += corr * ai * aj;
            denomB += corr * bi * bj;
        }
    }

    denomA = Math.sqrt(denomA);
    denomB = Math.sqrt(denomB);

    if (denomA === 0 || denomB === 0) {
        return 0;
    }

    return numerator / (denomA * denomB);
}

/**
 * Angular similarity (inverse of angular distance)
 * @param {number[]} vectorA - First vector
 * @param {number[]} vectorB - Second vector
 * @returns {number} Angular similarity (0 to 1)
 */
function angularSimilarity(vectorA, vectorB) {
    const cosine = cosineSimilarity(vectorA, vectorB);
    // Clamp to [-1, 1] to handle floating point errors
    const clampedCosine = Math.max(-1, Math.min(1, cosine));
    const angle = Math.acos(clampedCosine);
    return 1 - (angle / Math.PI);
}

/**
 * Jaccard similarity for binary or sparse vectors
 * @param {number[]} vectorA - First vector
 * @param {number[]} vectorB - Second vector
 * @param {number} threshold - Threshold for considering element as "present"
 * @returns {number} Jaccard similarity (0 to 1)
 */
function jaccardSimilarity(vectorA, vectorB, threshold = 0) {
    if (!vectorA || !vectorB) {
        return 0;
    }

    const maxLen = Math.max(vectorA.length, vectorB.length);
    let intersection = 0;
    let union = 0;

    for (let i = 0; i < maxLen; i++) {
        const aPresent = (vectorA[i] || 0) > threshold;
        const bPresent = (vectorB[i] || 0) > threshold;

        if (aPresent && bPresent) {
            intersection++;
        }
        if (aPresent || bPresent) {
            union++;
        }
    }

    return union > 0 ? intersection / union : 0;
}

module.exports = {
    // Similarity metrics
    cosineSimilarity,
    euclideanDistance,
    manhattanDistance,
    softCosineSimilarity,
    angularSimilarity,
    jaccardSimilarity,
    
    // Vector operations
    normalize,
    magnitude,
    add,
    subtract,
    scale,
    dotProduct,
    hadamardProduct,
    
    // Statistical operations
    mean,
    weightedMean,
    variance,
    
    // Dimensionality reduction
    reduceDimensionality,
    generateRandomProjection,
    projectVector,
    
    // Clustering and search
    kNearestNeighbors,
    kMeansClustering,
    silhouetteScore
};
