const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    kind: {
        type: String,
        required: true,
        enum: ['expense', 'income', 'transfer'],
        default: 'expense'
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01
    },
    originalAmount: {
        type: Number,
        required: true,
        min: 0.01
    },
    originalCurrency: {
        type: String,
        required: true,
        default: 'INR',
        uppercase: true
    },
    convertedAmount: {
        type: Number,
        min: 0.01
    },
    convertedCurrency: {
        type: String,
        uppercase: true
    },
    exchangeRate: {
        type: Number,
        min: 0
    },
    category: {
        type: String,
        required: true,
        enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other', 'salary', 'freelance', 'investment', 'transfer']
    },
    type: {
        type: String,
        required: true,
        enum: ['income', 'expense', 'transfer']
    },
    merchant: {
        type: String,
        trim: true,
        maxlength: 50,
        default: ''
    },
    date: {
        type: Date,
        default: Date.now
    },
    workspace: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        default: null
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    isPrivate: {
        type: Boolean,
        default: false
    },
    syncedToAccounting: {
        type: Boolean,
        default: false
    },
    version: {
        type: Number,
        default: 1
    },
    lastSyncedAt: {
        type: Date,
        default: Date.now
    },
    appliedRules: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Rule'
    }],
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: null
    },
    billing: {
        isBillable: { type: Boolean, default: false },
        isBilled: { type: Boolean, default: false },
        billedAt: Date,
        invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectInvoice' },
        markupOverride: Number
    },
    // New fields for Historical Currency Revaluation Engine Overhaul
    forexMetadata: {
        rateAtTransaction: { type: Number },
        rateSource: { type: String, default: 'manual' },
        lastRevaluedAt: { type: Date },
        isHistoricallyAccurate: { type: Boolean, default: false },
        historicalProvider: { type: String }
    },
    revaluationHistory: [{
        revaluedAt: { type: Date, default: Date.now },
        oldRate: Number,
        newRate: Number,
        oldConvertedAmount: Number,
        newConvertedAmount: Number,
        baseCurrency: String,
        reason: String
    }],
    status: {
        type: String,
        enum: ['pending', 'processing', 'validated', 'archived', 'failed'],
        default: 'pending'
    },
    processingLogs: [{
        step: String,
        status: String,
        timestamp: { type: Date, default: Date.now },
        message: String,
        details: mongoose.Schema.Types.Mixed
    }],
    // New fields for Smart Location Intelligence
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            default: [0, 0]
        }
    },
    formattedAddress: {
        type: String,
        trim: true
    },
    locationSource: {
        type: String,
        enum: ['manual', 'geocoded', 'inferred', 'none'],
        default: 'none'
    },
    place: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Place'
    },
    // New fields for Differential Data Synchronization
    vectorClock: {
        type: Map,
        of: Number,
        default: {}
    },
    syncMetadata: {
        lastDeviceId: String,
        isDeleted: { type: Boolean, default: false },
        deletedAt: Date,
        conflicts: [{
            deviceId: String,
            timestamp: Date,
            data: mongoose.Schema.Types.Mixed
        }]
    }
}, {
    timestamps: true
});

// Middleware to increment version on save
transactionSchema.pre('save', function (next) {
    if (this.isModified()) {
        this.version += 1;
        this.lastSyncedAt = Date.now();
    }
    // Auto-set kind based on type if not set
    if (this.type && !this.kind) {
        this.kind = this.type;
    }
    next();
});

// Method to log processing steps
transactionSchema.methods.logStep = async function (step, status, message, details = {}) {
    this.processingLogs.push({ step, status, message, details });
    if (status === 'failed') this.status = 'failed';
    return this.save();
};

// Indexes for performance optimization
transactionSchema.index({ description: 'text', merchant: 'text' }); // Text search
transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ workspace: 1, date: -1 });
transactionSchema.index({ user: 1, amount: 1 }); // Range queries optimization
transactionSchema.index({ user: 1, category: 1, date: -1 });
transactionSchema.index({ workspace: 1, category: 1, date: -1 });
transactionSchema.index({ location: '2dsphere' });
transactionSchema.index({ receiptId: 1 });
transactionSchema.index({ source: 1, user: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
