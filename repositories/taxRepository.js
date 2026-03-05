const TaxNode = require('../models/TaxNode');

/**
 * Tax Repository
 * Issue #843: Specialized storage for localized tax-rate histories and rule retrieval.
 */
class TaxRepository {
    /**
     * Finds active tax rules for a region and year.
     */
    async getActiveRules(region, year) {
        return TaxNode.findOne({ region, taxYear: year, isActive: true });
    }

    /**
     * Find specific rule for a category within a region.
     */
    async getRuleForCategory(region, year, category) {
        const node = await this.getActiveRules(region, year);
        if (!node) return null;

        return node.rules.find(r => r.category === category);
    }

    /**
     * Seed or update tax rules for a region.
     */
    async upsertTaxNode(data) {
        return TaxNode.findOneAndUpdate(
            { region: data.region, taxYear: data.taxYear },
            data,
            { upsert: true, new: true }
        );
    }
}

module.exports = new TaxRepository();
