const mongoose = require('mongoose');

/**
 * StockItem Model
 * Manages individual stock items with SKU tracking, batch numbers, and expiry dates
 */
const stockMovementSchema = new mongoose.Schema({
    movementType: {
        type: String,
        enum: ['in', 'out', 'transfer', 'adjustment', 'return'],
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    fromWarehouse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse'
    },
    toWarehouse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse'
    },
    reference: {
        type: String
    },
    referenceType: {
        type: String,
        enum: ['purchase_order', 'sales_order', 'transfer', 'adjustment', 'return']
    },
    movementDate: {
        type: Date,
        default: Date.now
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    notes: String
}, { _id: false });

const stockItemSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sku: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    itemName: {
        type: String,
        required: true
    },
    description: String,
    category: {
        type: String,
        required: true
    },
    subcategory: String,
    warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true,
        index: true
    },
    batchNumber: String,
    serialNumber: String,
    quantity: {
        current: {
            type: Number,
            required: true,
            default: 0
        },
        reserved: {
            type: Number,
            default: 0
        },
        available: {
            type: Number,
            default: 0
        },
        unit: {
            type: String,
            required: true,
            default: 'units'
        }
    },
    reorderPoint: {
        type: Number,
        default: 10
    },
    safetyStock: {
        type: Number,
        default: 5
    },
    maxStockLevel: {
        type: Number,
        default: 1000
    },
    pricing: {
        costPrice: {
            type: Number,
            default: 0
        },
        sellingPrice: {
            type: Number,
            default: 0
        },
        currency: {
            type: String,
            default: 'INR'
        }
    },
    valuation: {
        method: {
            type: String,
            enum: ['FIFO', 'LIFO', 'WAC', 'specific'],
            default: 'FIFO'
        },
        totalValue: {
            type: Number,
            default: 0
        }
    },
    expiryTracking: {
        isPerishable: {
            type: Boolean,
            default: false
        },
        expiryDate: Date,
        manufacturingDate: Date,
        shelfLife: {
            value: Number,
            unit: {
                type: String,
                enum: ['days', 'months', 'years']
            }
        }
    },
    dimensions: {
        length: Number,
        width: Number,
        height: Number,
        weight: Number,
        unit: String
    },
    supplier: {
        supplierId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor'
        },
        supplierName: String,
        leadTime: Number
    },
    stockStatus: {
        type: String,
        enum: ['in_stock', 'low_stock', 'out_of_stock', 'discontinued'],
        default: 'in_stock'
    },
    movements: [stockMovementSchema],
    lastRestocked: Date,
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Pre-save hook to calculate available quantity and stock status
stockItemSchema.pre('save', function (next) {
    this.quantity.available = this.quantity.current - this.quantity.reserved;

    // Update stock status
    if (this.quantity.current === 0) {
        this.stockStatus = 'out_of_stock';
    } else if (this.quantity.current <= this.reorderPoint) {
        this.stockStatus = 'low_stock';
    } else {
        this.stockStatus = 'in_stock';
    }

    // Update total value
    this.valuation.totalValue = this.quantity.current * this.pricing.costPrice;

    next();
});

// Indexes
stockItemSchema.index({ userId: 1, warehouseId: 1 });
stockItemSchema.index({ sku: 1 });
stockItemSchema.index({ category: 1, stockStatus: 1 });
stockItemSchema.index({ 'quantity.current': 1, reorderPoint: 1 });

module.exports = mongoose.model('StockItem', stockItemSchema);
