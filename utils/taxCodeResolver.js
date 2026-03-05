/**
 * Tax Code Resolver Utility
 * Issue #843: Mapping merchant categories and internal tags to regional tax codes.
 */
class TaxCodeResolver {
    constructor() {
        // Simulated mapping of internal categories to international tax standards
        this.mappings = {
            'Travel': { US: 'IRS-274', IN: 'GST-TRAVEL', EU: 'VAT-TRAVEL' },
            'Food & Dining': { US: 'IRS-274n', IN: 'GST-MEALS', EU: 'VAT-MEALS' },
            'Office Supplies': { US: 'IRS-162', IN: 'GST-OFFICE', EU: 'VAT-OFFICE' },
            'Software': { US: 'IRS-197', IN: 'GST-SOFTWARE', EU: 'VAT-SOFT' }
        };
    }

    /**
     * Resolves an official tax code based on category and region.
     */
    resolveCode(internalCategory, regionCode) {
        const country = regionCode.substring(0, 2).toUpperCase();
        const mapping = this.mappings[internalCategory];

        if (!mapping) return 'GENERAL';
        return mapping[country] || mapping['US'] || 'GENERAL';
    }

    /**
     * Determines if a merchant ID belongs to a high-deductibility category.
     */
    isMerchantTaxOptimized(merchantId) {
        // Simulated logic for identifying vendors with pre-negotiated tax-exempt status
        const optimizedPatterns = ['AMAZON-BUS', 'MSFT-AZURE', 'UBER-BUSINESS'];
        return optimizedPatterns.some(pattern => merchantId.includes(pattern));
    }
}

module.exports = new TaxCodeResolver();
