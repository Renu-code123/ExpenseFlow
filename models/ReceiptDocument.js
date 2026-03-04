const mongoose = require('mongoose');
const crypto = require('crypto');

const lineItemSchema = new mongoose.Schema({
    description: {
        type: String,
        trim: true
    },
    quantity: {
        type: Number,
        default: 1
    },
    unit_price: {
        type: Number,
        default: 0
    },
    total_price: {
        type: Number,
        default: 0
    },
    category: {
        type: String,
        default: null
    }
}, { _id: false });

const extractedDataSchema = new mongoose.Schema({
    merchant_name: {
        type: String,
        trim: true
    },
    merchant_address: {
        type: String,
        trim: true
    },
    merchant_phone: {
        type: String,
        trim: true
    },
    total_amount: {
        type: Number,
        default: 0
    },
    subtotal: {
        type: Number,
        default: 0
    },
    tax_amount: {
        type: Number,
        default: 0
    },
    tip_amount: {
        type: Number,
        default: 0
    },
    discount_amount: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: 'INR',
        uppercase: true
    },
    date: {
        type: Date,
        default: null
    },
    time: {
        type: String,
        default: null
    },
    payment_method: {
        type: String,
        enum: ['cash', 'credit_card', 'debit_card', 'upi', 'net_banking', 'other', null],
        default: null
    },
    card_last_four: {
        type: String,
        default: null
    },
    transaction_id: {
        type: String,
        default: null
    },
    invoice_number: {
        type: String,
        default: null
    },
    category: {
        type: String,
        enum: ['food', 'transport', 'shopping', 'entertainment', 'utilities', 'health', 'education', 'other', null],
        default: null
    },
    line_items: [lineItemSchema]
}, { _id: false });

const confidenceScoreSchema = new mongoose.Schema({
    overall: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    merchant: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    amount: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    date: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    }
}, { _id: false });

const receiptDocumentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User is required'],
        index: true
    },
    original_image: {
        url: {
            type: String,
            required: true
        },
        public_id: {
            type: String,
            required: true
        },
        format: {
            type: String,
            default: 'jpg'
        },
        size: {
            type: Number,
            default: 0
        }
    },
    thumbnail: {
        url: String,
        public_id: String
    },
    processed_text: {
        type: String,
        default: null
    },
    extracted_data: extractedDataSchema,
    confidence_scores: confidenceScoreSchema,
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'confirmed'],
        default: 'pending',
        index: true
    },
    processing_error: {
        type: String,
        default: null
    },
    image_hash: {
        type: String,
        index: true
    },
    is_duplicate: {
        type: Boolean,
        default: false
    },
    duplicate_of: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ReceiptDocument',
        default: null
    },
    expense_created: {
        type: Boolean,
        default: false
    },
    expense_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Expense',
        default: null
    },
    folder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DocumentFolder',
        default: null
    },
    tags: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    notes: {
        type: String,
        maxlength: [1000, 'Notes cannot exceed 1000 characters']
    },
    manually_corrected: {
        type: Boolean,
        default: false
    },
    correction_history: [{
        field: String,
        old_value: mongoose.Schema.Types.Mixed,
        new_value: mongoose.Schema.Types.Mixed,
        corrected_at: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Indexes
receiptDocumentSchema.index({ user: 1, createdAt: -1 });
receiptDocumentSchema.index({ user: 1, status: 1 });
receiptDocumentSchema.index({ 'extracted_data.merchant_name': 'text', processed_text: 'text', notes: 'text' });
receiptDocumentSchema.index({ 'extracted_data.date': 1 });
receiptDocumentSchema.index({ tags: 1 });

// Virtual for confidence level
receiptDocumentSchema.virtual('confidence_level').get(function() {
    const score = this.confidence_scores.overall;
    if (score >= 90) return 'high';
    if (score >= 70) return 'medium';
    return 'low';
});

// Instance methods

/**
 * Generate perceptual hash for duplicate detection
 */
receiptDocumentSchema.methods.generateImageHash = function(imageBuffer) {
    // Simple hash - in production, use a perceptual hash library
    const hash = crypto.createHash('md5');
    hash.update(imageBuffer);
    this.image_hash = hash.digest('hex');
    return this.image_hash;
};

/**
 * Mark as confirmed and create expense
 */
receiptDocumentSchema.methods.confirmAndCreateExpense = async function() {
    if (this.status !== 'completed') {
        throw new Error('Receipt must be in completed status');
    }
    
    if (this.expense_created) {
        throw new Error('Expense already created from this receipt');
    }
    
    const Expense = require('./Expense');
    
    const expenseData = {
        user: this.user,
        description: this.extracted_data.merchant_name || 'Receipt expense',
        amount: this.extracted_data.total_amount,
        currency: this.extracted_data.currency,
        category: this.extracted_data.category || 'other',
        date: this.extracted_data.date || new Date(),
        type: 'expense',
        payment_method: this.extracted_data.payment_method,
        receipt: {
            url: this.original_image.url,
            public_id: this.original_image.public_id
        },
        notes: this.notes,
        metadata: {
            created_from_receipt: true,
            receipt_id: this._id,
            merchant_name: this.extracted_data.merchant_name,
            invoice_number: this.extracted_data.invoice_number
        }
    };
    
    const expense = await Expense.create(expenseData);
    
    this.status = 'confirmed';
    this.expense_created = true;
    this.expense_id = expense._id;
    await this.save();
    
    return expense;
};

/**
 * Correct extracted data
 */
receiptDocumentSchema.methods.correctData = async function(corrections) {
    for (const [field, value] of Object.entries(corrections)) {
        if (this.extracted_data[field] !== undefined) {
            // Store correction history
            this.correction_history.push({
                field,
                old_value: this.extracted_data[field],
                new_value: value
            });
            
            this.extracted_data[field] = value;
        }
    }
    
    this.manually_corrected = true;
    await this.save();
    
    return this;
};

/**
 * Check for duplicates
 */
receiptDocumentSchema.methods.checkDuplicate = async function() {
    if (!this.image_hash) {
        return null;
    }
    
    const duplicate = await this.constructor.findOne({
        _id: { $ne: this._id },
        user: this.user,
        image_hash: this.image_hash,
        status: { $ne: 'failed' }
    }).sort({ createdAt: 1 });
    
    if (duplicate) {
        this.is_duplicate = true;
        this.duplicate_of = duplicate._id;
        await this.save();
    }
    
    return duplicate;
};

/**
 * Add tag
 */
receiptDocumentSchema.methods.addTag = async function(tag) {
    const normalizedTag = tag.toLowerCase().trim();
    
    if (!this.tags.includes(normalizedTag)) {
        this.tags.push(normalizedTag);
        await this.save();
    }
    
    return this;
};

/**
 * Remove tag
 */
receiptDocumentSchema.methods.removeTag = async function(tag) {
    const normalizedTag = tag.toLowerCase().trim();
    this.tags = this.tags.filter(t => t !== normalizedTag);
    await this.save();
    return this;
};

// Static methods

/**
 * Get user receipts with filters
 */
receiptDocumentSchema.statics.getUserReceipts = async function(userId, options = {}) {
    const {
        status,
        startDate,
        endDate,
        merchant,
        minAmount,
        maxAmount,
        category,
        tags,
        folder,
        limit = 50,
        offset = 0
    } = options;
    
    const query = { user: userId };
    
    if (status) query.status = status;
    if (folder) query.folder = folder;
    
    if (startDate || endDate) {
        query['extracted_data.date'] = {};
        if (startDate) query['extracted_data.date'].$gte = new Date(startDate);
        if (endDate) query['extracted_data.date'].$lte = new Date(endDate);
    }
    
    if (merchant) {
        query['extracted_data.merchant_name'] = new RegExp(merchant, 'i');
    }
    
    if (minAmount !== undefined || maxAmount !== undefined) {
        query['extracted_data.total_amount'] = {};
        if (minAmount !== undefined) query['extracted_data.total_amount'].$gte = minAmount;
        if (maxAmount !== undefined) query['extracted_data.total_amount'].$lte = maxAmount;
    }
    
    if (category) query['extracted_data.category'] = category;
    
    if (tags && tags.length > 0) {
        query.tags = { $all: tags };
    }
    
    return await this.find(query)
        .populate('folder', 'name color')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset);
};

/**
 * Search receipts
 */
receiptDocumentSchema.statics.searchReceipts = async function(userId, searchText, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    return await this.find({
        user: userId,
        $text: { $search: searchText }
    }, {
        score: { $meta: 'textScore' }
    })
        .populate('folder', 'name color')
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .skip(offset);
};

/**
 * Get statistics
 */
receiptDocumentSchema.statics.getUserStatistics = async function(userId) {
    const [total, byStatus, byCategory] = await Promise.all([
        this.countDocuments({ user: userId }),
        this.aggregate([
            { $match: { user: mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        this.aggregate([
            {
                $match: {
                    user: mongoose.Types.ObjectId(userId),
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: '$extracted_data.category',
                    count: { $sum: 1 },
                    total_amount: { $sum: '$extracted_data.total_amount' }
                }
            },
            { $sort: { total_amount: -1 } }
        ])
    ]);
    
    return {
        total_receipts: total,
        by_status: byStatus.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
        }, {}),
        by_category: byCategory
    };
};

/**
 * Get pending receipts
 */
receiptDocumentSchema.statics.getPendingReceipts = async function(userId) {
    return await this.find({
        user: userId,
        status: { $in: ['pending', 'processing'] }
    }).sort({ createdAt: -1 });
};

/**
 * Get unconfirmed receipts
 */
receiptDocumentSchema.statics.getUnconfirmedReceipts = async function(userId) {
    return await this.find({
        user: userId,
        status: 'completed',
        expense_created: false
    }).sort({ createdAt: -1 });
};

/**
 * Clean up failed receipts older than 30 days
 */
receiptDocumentSchema.statics.cleanupFailedReceipts = async function() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    return await this.deleteMany({
        status: 'failed',
        createdAt: { $lt: thirtyDaysAgo }
    });
};

// Enable virtuals in JSON
receiptDocumentSchema.set('toJSON', { virtuals: true });
receiptDocumentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('ReceiptDocument', receiptDocumentSchema);
