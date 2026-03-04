const mongoose = require('mongoose');

const taxAuditPackSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    auditId: {
        type: String,
        unique: true,
        required: true
    },
    period: {
        start: Date,
        end: Date
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    statistics: {
        totalTransactions: Number,
        totalTaxAmount: Number,
        flaggedAmount: Number,
        forensicFindings: Number
    },
    snapshotData: mongoose.Schema.Types.Mixed, // Encapsulated snapshot for point-in-time audit
    reportUrl: String,
    files: [String],
    generatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('TaxAuditPack', taxAuditPackSchema);
