const mongoose = require('mongoose');

const procurementItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true },
    category: { type: String, required: true },
    expectedDelivery: Date
});

const procurementOrderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderNumber: {
        type: String,
        required: true,
        unique: true
    },
    title: { type: String, required: true },
    type: {
        type: String,
        enum: ['requisition', 'purchase_order'],
        default: 'requisition'
    },
    status: {
        type: String,
        enum: ['draft', 'pending_approval', 'approved', 'ordered', 'received', 'cancelled'],
        default: 'draft'
    },
    vendor: {
        name: String,
        contact: String,
        email: String,
        address: String
    },
    items: [procurementItemSchema],
    totalAmount: { type: Number, required: true, default: 0 },
    currency: { type: String, default: 'INR' },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    department: String,
    budgetCode: String,
    notes: String,
    attachments: [String],
    approvalFlow: [{
        approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'approved', 'rejected'] },
        comment: String,
        date: Date
    }],
    receivedDate: Date,
    linkedAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }
}, {
    timestamps: true
});

// Middleware to calculate total amount before saving
procurementOrderSchema.pre('save', function (next) {
    if (this.items && this.items.length > 0) {
        this.totalAmount = this.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    }
    next();
});

module.exports = mongoose.model('ProcurementOrder', procurementOrderSchema);
