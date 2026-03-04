const mongoose = require('mongoose');

/**
 * TaxNexus Model
 * Issue #961: Geographic and jurisdictional boundary mapping for autonomous tax compliance.
 * A "Nexus" is established when a business has a taxable presence in a jurisdiction.
 */
const TaxNexusSchema = new mongoose.Schema({
    jurisdictionCode: {
        type: String,
        required: true,
        uppercase: true,
        index: true, // e.g., 'US-CA', 'IN-MH', 'DE', 'GB'
    },
    jurisdictionName: { type: String, required: true },
    taxType: {
        type: String,
        enum: ['VAT', 'GST', 'SALES_TAX', 'WITHHOLDING', 'EXCISE'],
        required: true
    },
    rate: { type: Number, required: true, min: 0, max: 1 }, // e.g., 0.18 for 18% GST
    // Geofencing polygon for merchant-location detection
    geoBoundary: {
        type: {
            type: String,
            enum: ['Polygon'],
            default: 'Polygon'
        },
        coordinates: { type: [[[Number]]], default: undefined }
    },
    // IP CIDR ranges associated with this jurisdiction
    ipCidrRanges: [String],
    // The PolicyNode that must be mounted for this nexus
    policyNodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'PolicyNode' },
    // Rules that define when nexus is triggered
    nexusTriggers: [{
        type: {
            type: String,
            enum: ['MERCHANT_LOCATION', 'IP_ORIGIN', 'CURRENCY', 'AMOUNT_THRESHOLD']
        },
        threshold: Number,
        currencyCode: String
    }],
    effectiveFrom: { type: Date, default: Date.now },
    expiresAt: Date,
    isActive: { type: Boolean, default: true },
    source: { type: String, default: 'LOCAL' } // 'LOCAL' | 'GLOBAL_SYNC'
}, { timestamps: true });

TaxNexusSchema.index({ jurisdictionCode: 1, taxType: 1 }, { unique: true });
TaxNexusSchema.index({ geoBoundary: '2dsphere' });

module.exports = mongoose.model('TaxNexus', TaxNexusSchema);
