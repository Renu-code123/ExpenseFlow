const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema({
    paidBy: {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        name: String,
        email: String
    },
    paidTo: {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        name: String,
        email: String
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01
    },
    currency: {
        type: String,
        default: 'INR',
        uppercase: true
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        default: null
    },
    relatedExpenses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SplitExpense'
    }],
    method: {
        type: String,
        enum: ['cash', 'bank_transfer', 'upi', 'credit_card', 'paypal', 'venmo', 'other'],
        default: 'cash'
    },
    transactionId: {
        type: String,
        trim: true
    },
    notes: {
        type: String,
        trim: true,
        maxlength: 500
    },
    receipt: {
        url: String,
        publicId: String
    },
    settledAt: {
        type: Date,
        default: Date.now
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    verifiedAt: Date,
    status: {
        type: String,
        enum: ['pending', 'verified', 'disputed'],
        default: 'verified'
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
settlementSchema.index({ 'paidBy.user': 1, settledAt: -1 });
settlementSchema.index({ 'paidTo.user': 1, settledAt: -1 });
settlementSchema.index({ group: 1, settledAt: -1 });
settlementSchema.index({ status: 1 });

// Validation: prevent self-settlement
settlementSchema.pre('save', function(next) {
    if (this.paidBy.user.toString() === this.paidTo.user.toString()) {
        return next(new Error('Cannot settle with yourself'));
    }
    next();
});

// Method to verify settlement
settlementSchema.methods.verify = async function(userId) {
    this.verifiedBy = userId;
    this.verifiedAt = new Date();
    this.status = 'verified';
    return await this.save();
};

// Method to dispute settlement
settlementSchema.methods.dispute = async function(reason) {
    this.status = 'disputed';
    this.notes = (this.notes || '') + `\n[DISPUTED]: ${reason}`;
    return await this.save();
};

// Static method to get user's settlements
settlementSchema.statics.getUserSettlements = async function(userId, options = {}) {
    const query = {
        $or: [
            { 'paidBy.user': userId },
            { 'paidTo.user': userId }
        ]
    };
    
    if (options.status) {
        query.status = options.status;
    }
    
    if (options.groupId) {
        query.group = options.groupId;
    }
    
    const { startDate, endDate } = options;
    if (startDate || endDate) {
        query.settledAt = {};
        if (startDate) query.settledAt.$gte = new Date(startDate);
        if (endDate) query.settledAt.$lte = new Date(endDate);
    }
    
    return await this.find(query)
        .populate('group', 'name')
        .populate('paidBy.user paidTo.user', 'name email')
        .sort({ settledAt: -1 })
        .limit(options.limit || 100);
};

// Static method to get settlement summary
settlementSchema.statics.getSettlementSummary = async function(userId, groupId = null) {
    const matchQuery = {
        $or: [
            { 'paidBy.user': mongoose.Types.ObjectId(userId) },
            { 'paidTo.user': mongoose.Types.ObjectId(userId) }
        ],
        status: 'verified'
    };
    
    if (groupId) {
        matchQuery.group = mongoose.Types.ObjectId(groupId);
    }
    
    const summary = await this.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: null,
                totalPaid: {
                    $sum: {
                        $cond: [
                            { $eq: ['$paidBy.user', mongoose.Types.ObjectId(userId)] },
                            '$amount',
                            0
                        ]
                    }
                },
                totalReceived: {
                    $sum: {
                        $cond: [
                            { $eq: ['$paidTo.user', mongoose.Types.ObjectId(userId)] },
                            '$amount',
                            0
                        ]
                    }
                },
                count: { $sum: 1 }
            }
        }
    ]);
    
    if (summary.length === 0) {
        return { totalPaid: 0, totalReceived: 0, count: 0, netBalance: 0 };
    }
    
    const result = summary[0];
    result.netBalance = result.totalReceived - result.totalPaid;
    return result;
};

// Static method to get group settlement history
settlementSchema.statics.getGroupSettlementHistory = async function(groupId) {
    return await this.find({ group: groupId })
        .populate('paidBy.user paidTo.user', 'name email')
        .sort({ settledAt: -1 });
};

module.exports = mongoose.model('Settlement', settlementSchema);
