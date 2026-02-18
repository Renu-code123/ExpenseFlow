const mongoose = require('mongoose');

const complianceRuleSchema = new mongoose.Schema({
    jurisdiction: {
        type: String,
        required: true,
        index: true
    },
    taxType: {
        type: String,
        enum: ['GST', 'VAT', 'TDS', 'IncomeTax', 'SalesTax'],
        required: true
    },
    rate: {
        type: Number,
        required: true
    },
    conditions: {
        threshold: Number,
        category: [String],
        isExport: Boolean,
        hasReverseCharge: Boolean
    },
    effectiveFrom: {
        type: Date,
        required: true
    },
    effectiveTo: Date,
    isActive: {
        type: Boolean,
        default: true
    },
    description: String,
    legalReference: String
}, {
    timestamps: true
});

module.exports = mongoose.model('ComplianceRule', complianceRuleSchema);
