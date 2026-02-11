const mongoose = require('mongoose');

const fixedAssetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    assetCode: {
        type: String,
        unique: true,
        required: true
    },
    category: {
        type: String,
        enum: ['IT Equipment', 'Furniture', 'Machinery', 'Buildings', 'Vehicles', 'Others'],
        required: true,
        index: true
    },
    description: String,
    purchaseDate: {
        type: Date,
        required: true
    },
    purchasePrice: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'INR'
    },
    salvageValue: {
        type: Number,
        default: 0
    },
    usefulLife: {
        type: Number, // in years
        required: true
    },
    depreciationMethod: {
        type: String,
        enum: ['Straight Line', 'Written Down Value'],
        default: 'Straight Line'
    },
    depreciationRate: {
        type: Number, // for WDV primarily
        default: 0
    },
    status: {
        type: String,
        enum: ['Active', 'Disposed', 'Transferred', 'Written Off'],
        default: 'Active'
    },
    location: String,
    department: String,
    currentBookValue: {
        type: Number,
        required: true
    },
    accumulatedDepreciation: {
        type: Number,
        default: 0
    },
    disposalDetails: {
        date: Date,
        price: Number,
        gainLoss: Number,
        reason: String
    }
}, {
    timestamps: true
});

fixedAssetSchema.index({ assetCode: 1 });
fixedAssetSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('FixedAsset', fixedAssetSchema);
