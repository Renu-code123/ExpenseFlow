const mongoose = require('mongoose');

const reconciliationReportSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    reportId: {
        type: String,
        unique: true,
        required: true
    },
    period: {
        month: Number,
        year: Number,
        startDate: Date,
        endDate: Date
    },
    entityAParty: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true
    },
    entityBParty: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true
    },
    summary: {
        totalTxns: Number,
        matchedTxns: Number,
        unmatchedTxns: Number,
        discrepancyAmount: { type: Number, default: 0 }
    },
    details: [{
        txnId: mongoose.Schema.Types.ObjectId,
        status: String,
        amountA: Number,
        amountB: Number,
        difference: Number,
        reason: String
    }],
    settlementStatus: {
        type: String,
        enum: ['None Required', 'Pending', 'Partially Settled', 'Fully Settled'],
        default: 'Pending'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

reconciliationReportSchema.index({ userId: 1, 'period.year': 1, 'period.month': 1 });

module.exports = mongoose.model('ReconciliationReport', reconciliationReportSchema);
