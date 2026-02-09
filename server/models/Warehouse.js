const mongoose = require('mongoose');

/**
 * Warehouse Model
 * Manages multiple warehouse/storage locations for inventory
 */
const warehouseSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    warehouseCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    warehouseName: {
        type: String,
        required: true
    },
    location: {
        address: String,
        city: String,
        state: String,
        country: String,
        zipCode: String,
        coordinates: {
            latitude: Number,
            longitude: Number
        }
    },
    warehouseType: {
        type: String,
        enum: ['main', 'regional', 'distribution', 'retail', 'virtual'],
        default: 'main'
    },
    capacity: {
        totalSpace: {
            type: Number,
            default: 0
        },
        usedSpace: {
            type: Number,
            default: 0
        },
        unit: {
            type: String,
            enum: ['sqft', 'sqm', 'cubic_ft', 'cubic_m'],
            default: 'sqft'
        }
    },
    manager: {
        name: String,
        email: String,
        phone: String
    },
    operatingHours: {
        openTime: String,
        closeTime: String,
        workingDays: [String]
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'maintenance', 'closed'],
        default: 'active'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Indexes
warehouseSchema.index({ userId: 1, status: 1 });
warehouseSchema.index({ warehouseCode: 1 });

module.exports = mongoose.model('Warehouse', warehouseSchema);
