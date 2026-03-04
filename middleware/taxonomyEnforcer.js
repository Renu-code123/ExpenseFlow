const taxonomyResolver = require('../services/taxonomyResolver');

/**
 * Taxonomy Enforcer Middleware
 * Issue #706: Validates hierarchical category constraints on mutations.
 */
const taxonomyEnforcer = async (req, res, next) => {
    // Only intercept routes that handle transactions or budgets
    const interceptedRoutes = ['/api/expenses', '/api/budgets'];
    const isTargetRoute = interceptedRoutes.some(route => req.originalUrl.startsWith(route));
    const isMutation = ['POST', 'PUT', 'PATCH'].includes(req.method);

    if (!isTargetRoute || !isMutation || !req.body.category) {
        return next();
    }

    try {
        const userId = req.user._id;
        const categoryId = req.body.category;

        // Verify the category exists and is accessible to the user
        const category = await taxonomyResolver.resolveCategory(categoryId, userId);

        if (!category) {
            return res.status(400).json({
                success: false,
                error: 'Invalid category identifier or access denied.',
                submittedCategory: categoryId
            });
        }

        // Optional: Enforcement of transaction type vs category type
        if (req.body.type && category.type !== 'system' && category.type !== req.body.type) {
            return res.status(400).json({
                success: false,
                error: `Taxonomy mismatch: Category '${category.name}' is for types [${category.type}], but transaction is [${req.body.type}].`
            });
        }

        // Attach resolved taxonomy object to request for downstream use
        req.resolvedTaxonomy = category;
        next();
    } catch (error) {
        console.error('[TaxonomyEnforcer] Error:', error);
        res.status(500).json({ success: false, error: 'Internal taxonomy validation failure.' });
    }
};

module.exports = taxonomyEnforcer;
