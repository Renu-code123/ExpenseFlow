const mongoose = require('mongoose');

const fixedAssetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: { type: String, required: true },
    description: String,
    category: {
        type: String,
        enum: ['furniture', 'electronics', 'machinery', 'vehicles', 'real_estate', 'software', 'other'],
        required: true
    },
    serialNumber: { type: String, unique: true, sparse: true },
    modelNumber: String,
    manufacturer: String,

    // Financials
    purchaseDate: { type: Date, required: true },
    purchasePrice: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    salvageValue: { type: Number, default: 0 },
    usefulLifeYears: { type: Number, required: true },

    // Depreciation Config
    depreciationMethod: {
        type: String,
        enum: ['SLM', 'DBM'], // SLM: Straight Line, DBM: Declining Balance
        default: 'SLM'
    },
    depreciationRate: { type: Number, default: 0 }, // For DBM

    // Status
    status: {
        type: String,
        enum: ['active', 'disposed', 'maintenance', 'written_off'],
        default: 'active'
    },
    location: String,
    department: String,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Links
    procurementOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProcurementOrder' },

    // Current Values
    currentBookValue: { type: Number },
    lastDepreciationDate: Date,

    notes: String,
    maintenanceHistory: [{
        date: { type: Date, default: Date.now },
        type: { type: String, enum: ['routine', 'repair', 'upgrade'] },
        description: String,
        cost: { type: Number, default: 0 },
        performedBy: String,
        nextServiceDate: Date
    }],
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true
});

// Calculate initial book value before saving
fixedAssetSchema.pre('save', function (next) {
    if (this.isNew) {
        this.currentBookValue = this.purchasePrice;
    }
    next();
});

module.exports = mongoose.model('FixedAsset', fixedAssetSchema);
