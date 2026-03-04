const mongoose = require('mongoose');

const intercompanyTransactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sourceEntityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    targetEntityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    transactionDate: {
        type: Date,
        default: Date.now,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    description: String,
    referenceNumber: {
        type: String,
        unique: true
    },
    type: {
        type: String,
        enum: ['Transfer', 'Service Charge', 'Loan', 'Expense Reimbursement'],
        default: 'Transfer'
    },
    status: {
        type: String,
        enum: ['Pending', 'Matched', 'Disputed', 'Settled'],
        default: 'Pending',
        index: true
    },
    matchId: {
        type: String, // ID to link the corresponding transaction in the other entity
        index: true
    },
    auditTrail: [{
        action: String,
        timestamp: { type: Date, default: Date.now },
        performedBy: String
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('IntercompanyTransaction', intercompanyTransactionSchema);
