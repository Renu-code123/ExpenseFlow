/**
 * Vector-Graph Math Utility
 * Issue #866: High-dimensional similarity and eligibility scoring.
 * Determines if a specific fund DNA matches the semantic requirements of an expense.
 */
class VectorGraphMath {
    /**
     * Calculates the eligibility score between a fund's restrictions and an expense's attributes.
     * Returns a score between 0 and 1.
     */
    static calculateEligibilityScore(fundDna, expenseCategory, tags = []) {
        // Semantic mapping of fund types to approved categories
        const dnaMap = {
            'STATE_GRANT': ['R&D', 'EDUCATION', 'INFRASTRUCTURE'],
            'VENTURE_CAPITAL': ['GROWTH', 'MARKETING', 'SALARY', 'R&D'],
            'REVENUE': ['ANY'],
            'LOAN': ['OPERATIONS', 'EQUIPMENT'],
            'EQUITY': ['ANY']
        };

        const allowedCategories = dnaMap[fundDna] || [];

        if (allowedCategories.includes('ANY')) return 1.0;
        if (allowedCategories.includes(expenseCategory.toUpperCase())) return 1.0;

        // Partial match simulation (e.g., if tags are related)
        if (tags.some(tag => allowedCategories.includes(tag.toUpperCase()))) {
            return 0.8;
        }

        return 0.0;
    }

    /**
     * Generates a provenance hash for a virtual money fragment.
     */
    static generateProvenanceHash(entityId, sourceDna, amount) {
        const crypto = require('crypto');
        return crypto.createHash('sha256')
            .update(`${entityId}:${sourceDna}:${amount}:${Date.now()}`)
            .digest('hex');
    }
}

module.exports = VectorGraphMath;
