const mongoose = require('mongoose');

/**
 * BackOrder Model
 * Manages stock-outs and pending orders when inventory is insufficient
 */
const backOrderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    backOrderId: {
        type: String,
        unique: true,
        required: true
    },
    stockItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StockItem',
        required: true,
        index: true
    },
    sku: {
        type: String,
        required: true
    },
    itemName: String,
    requestedQuantity: {
        type: Number,
        required: true
    },
    fulfilledQuantity: {
        type: Number,
        default: 0
    },
    pendingQuantity: {
        type: Number,
        required: true
    },
    warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    requestDate: {
        type: Date,
        default: Date.now
    },
    expectedFulfillmentDate: Date,
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['pending', 'partially_fulfilled', 'fulfilled', 'cancelled'],
        default: 'pending'
    },
    linkedProcurementOrder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProcurementOrder'
    },
    fulfillmentHistory: [{
        quantity: Number,
        fulfilledDate: Date,
        batchNumber: String,
        notes: String
    }],
    cancellationReason: String,
    notes: String
}, {
    timestamps: true
});

// Pre-save hook to update pending quantity
backOrderSchema.pre('save', function (next) {
    this.pendingQuantity = this.requestedQuantity - this.fulfilledQuantity;

    // Update status based on fulfillment
    if (this.fulfilledQuantity === 0) {
        this.status = 'pending';
    } else if (this.fulfilledQuantity < this.requestedQuantity) {
        this.status = 'partially_fulfilled';
    } else if (this.fulfilledQuantity >= this.requestedQuantity) {
        this.status = 'fulfilled';
    }

    next();
});

// Indexes
backOrderSchema.index({ userId: 1, status: 1 });
backOrderSchema.index({ stockItemId: 1, status: 1 });
backOrderSchema.index({ priority: 1, requestDate: 1 });

module.exports = mongoose.model('BackOrder', backOrderSchema);
