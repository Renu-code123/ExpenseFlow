const mongoose = require('mongoose');

const expenseSubmissionSchema = new mongoose.Schema({
    submitter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    team: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team'
    },
    details: {
        description: { type: String, required: true },
        amount: { type: Number, required: true },
        currency: { type: String, default: 'INR' },
        category: { type: String, required: true },
        date: { type: Date, default: Date.now },
        merchant: String,
        receiptUrl: String
    },
    status: {
        type: String,
        enum: ['draft', 'pending', 'approved', 'rejected', 'more_info'],
        default: 'pending'
    },
    currentStep: {
        type: Number,
        default: 1
    },
    workflow: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ApprovalWorkflow'
    },
    approvals: [{
        approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        step: Number,
        decision: { type: String, enum: ['approved', 'rejected', 'more_info'] },
        comment: String,
        decidedAt: { type: Date, default: Date.now }
    }],
    auditTrail: [{
        action: String,
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        details: String,
        timestamp: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('ExpenseSubmission', expenseSubmissionSchema);
