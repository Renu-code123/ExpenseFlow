const mongoose = require('mongoose');

const projectInvoiceSchema = new mongoose.Schema({
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    invoiceNumber: {
        type: String,
        unique: true,
        required: true
    },
    period: {
        start: Date,
        end: Date
    },
    lineItems: [{
        description: String,
        expenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
        originalAmount: Number,
        markupAmount: Number,
        totalAmount: Number
    }],
    subtotal: Number,
    taxAmount: Number,
    totalAmount: Number,
    status: {
        type: String,
        enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
        default: 'draft'
    },
    dueDate: Date,
    notes: String
}, {
    timestamps: true
});

module.exports = mongoose.model('ProjectInvoice', projectInvoiceSchema);
