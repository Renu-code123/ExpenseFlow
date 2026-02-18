/**
 * Search Configuration
 * Issue #634: High-Performance Search Engine
 */

module.exports = {
    // Caching settings
    cache: {
        enabled: true,
        ttl: 60 * 5, // 5 minutes in seconds
        maxSize: 1000 // Maximum number of items in cache
    },

    // Search result settings
    results: {
        defaultLimit: 50,
        maxLimit: 200,
        facetsEnabled: true
    },

    // Scoring weights for results
    scoring: {
        merchantMatch: 2.0,
        descriptionMatch: 1.5,
        categoryMatch: 1.0
    }
};
