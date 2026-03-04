const mongoose = require('mongoose');

/**
 * TaxNode Model
 * Issue #843: Hierarchical regional tax-rule representations.
 * Stores tax codes, rates, and deduction eligibility rules for different jurisdictions.
 */
const taxNodeSchema = new mongoose.Schema({
    region: { type: String, required: true }, // e.g., 'US-CA', 'IN-KA', 'EU-FR'
    taxYear: { type: Number, required: true },
    currency: { type: String, required: true },
    rules: [{
        category: { type: String, required: true }, // merchant category code or internal category
        deductionRate: { type: Number, default: 0 }, // 0.0 to 1.0 (e.g., 1.0 for 100% deductible)
        isDeductible: { type: Boolean, default: false },
        limit: { type: Number }, // Annual limit for this category
        taxCode: { type: String }, // Official tax code mapping (IRS, GST, VAT)
        conditions: { type: mongoose.Schema.Types.Mixed } // Extra logic for eligibility
    }],
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

taxNodeSchema.index({ region: 1, taxYear: 1 }, { unique: true });

module.exports = mongoose.model('TaxNode', taxNodeSchema);
