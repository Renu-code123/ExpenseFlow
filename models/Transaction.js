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
    }]
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

// Indexes for performance optimization
transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ workspace: 1, date: -1 });
transactionSchema.index({ user: 1, type: 1, date: -1 });
transactionSchema.index({ workspace: 1, type: 1, date: -1 });
transactionSchema.index({ user: 1, category: 1, date: -1 });
transactionSchema.index({ workspace: 1, category: 1, date: -1 });
transactionSchema.index({ receiptId: 1 });
transactionSchema.index({ source: 1, user: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
