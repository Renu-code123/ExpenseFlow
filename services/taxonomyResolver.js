const Taxonomy = require('../models/Taxonomy');
const treeProcessor = require('../utils/treeProcessor');

/**
 * Taxonomy Resolver Service
 * Issue #706: Manages hierarchical resolution and category mapping.
 */
class TaxonomyResolver {
    /**
     * Resolve all categories for a user, including global system categories.
     */
    async getUserTaxonomy(userId) {
        return await Taxonomy.find({
            $or: [
                { user: userId },
                { isSystem: true },
                { user: null }
            ]
        }).sort({ level: 1, name: 1 });
    }

    /**
     * Get a nested tree structure of categories.
     */
    async getTree(userId) {
        const flatList = await this.getUserTaxonomy(userId);
        return treeProcessor.buildTree(flatList);
    }

    /**
     * Resolve a category by slug or ID with fallback logic.
     */
    async resolveCategory(identifier, userId) {
        const query = {
            $or: [
                { _id: identifier.match(/^[0-9a-fA-F]{24}$/) ? identifier : null },
                { slug: identifier }
            ],
            $or: [
                { user: userId },
                { isSystem: true },
                { user: null }
            ]
        };
        // Remove null _id from query if identifier is not an ObjectId
        if (!query.$or[0]._id) query.$or.shift();

        return await Taxonomy.findOne(query);
    }

    /**
     * Find all transactions belonging to a category or its children.
     */
    async getCategoryInclusiveIds(categoryId, userId) {
        const flatList = await this.getUserTaxonomy(userId);
        const descendantIds = treeProcessor.getDescendantIds(flatList, categoryId);
        return [categoryId, ...descendantIds];
    }

    /**
     * Create a new category with path validation.
     */
    async createCategory(data, userId) {
        const taxonomy = new Taxonomy({
            ...data,
            user: userId,
            isSystem: false
        });

        // Ensure slug is unique for this user
        const existing = await Taxonomy.findOne({ slug: taxonomy.slug, user: userId });
        if (existing) throw new Error(`Category with slug '${taxonomy.slug}' already exists.`);

        return await taxonomy.save();
    }
}

module.exports = new TaxonomyResolver();
