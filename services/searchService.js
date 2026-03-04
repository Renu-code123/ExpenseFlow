const Transaction = require('../models/Transaction');
const queryParser = require('../utils/queryParser');
const config = require('../config/search');

class SearchService {
    /**
     * Perform advanced search with facets and pagination
     */
    async search(userId, searchString, options = {}) {
        const { page = 1, limit = config.results.defaultLimit } = options;
        const skip = (page - 1) * limit;

        // 1. Parse query string
        const filters = queryParser.parse(searchString);
        filters.user = userId; // Ensure user scoping

        // 2. Build Aggregation Pipeline
        const pipeline = [
            { $match: filters }
        ];

        // If text search is present, sort by relevance score
        if (filters.$text) {
            pipeline.push({
                $addFields: { score: { $meta: "textScore" } }
            });
            pipeline.push({
                $sort: { score: { $meta: "textScore" }, date: -1 }
            });
        } else {
            pipeline.push({ $sort: { date: -1 } });
        }

        // Facets for category and merchant distribution
        const facetStages = {
            metadata: [{ $count: "total" }, { $addFields: { page: parseInt(page) } }],
            data: [{ $skip: skip }, { $limit: parseInt(limit) }],
        };

        if (config.results.facetsEnabled) {
            facetStages.categories = [
                { $group: { _id: "$category", count: { $sum: 1 }, totalAmount: { $sum: "$amount" } } },
                { $sort: { count: -1 } }
            ];
            facetStages.merchants = [
                { $group: { _id: "$merchant", count: { $sum: 1 } } },
                { $match: { _id: { $ne: "" } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ];
        }

        pipeline.push({ $facet: facetStages });

        const results = await Transaction.aggregate(pipeline);

        // Process results
        const output = results[0];
        const total = output.metadata[0] ? output.metadata[0].total : 0;

        return {
            success: true,
            data: output.data,
            facets: {
                categories: output.categories,
                merchants: output.merchants
            },
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            },
            query: filters
        };
    }

    /**
     * Fuzzy Merchant Search using Regex (Trigram approximation for MongoDB)
     */
    async findSimilarMerchants(userId, partialName) {
        if (!partialName || partialName.length < 2) return [];

        // Simple fuzzy match: matches sub-sequences
        const regex = new RegExp(partialName.split('').join('.*'), 'i');

        return await Transaction.distinct('merchant', {
            user: userId,
            merchant: regex
        });
    }
}

module.exports = new SearchService();
