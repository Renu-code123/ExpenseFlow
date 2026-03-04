const mongoose = require('mongoose');

const billPaymentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    bill: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bill',
        required: true,
        index: true
    },
    
    // Payment Details
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    paid_date: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    },
    
    // Payment Method
    payment_method: {
        type: String,
        required: true,
        enum: ['bank_transfer', 'credit_card', 'debit_card', 'cash', 'check', 'auto_pay', 'paypal', 'other']
    },
    
    // Confirmation
    confirmation_number: String,
    transaction_id: String,
    
    // Additional Info
    notes: String,
    receipt_url: String,
    
    // Status
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'completed'
    },
    
    // Late Fee (if applicable)
    late_fee_amount: {
        type: Number,
        default: 0
    },
    
    // Payment Source
    account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account'
    }
}, {
    timestamps: true
});

// Indexes
billPaymentSchema.index({ user: 1, paid_date: -1 });
billPaymentSchema.index({ bill: 1, paid_date: -1 });
billPaymentSchema.index({ user: 1, status: 1 });

// Static methods
billPaymentSchema.statics.getPaymentHistory = function(userId, billId = null, limit = 50) {
    const query = { user: userId, status: 'completed' };
    
    if (billId) {
        query.bill = billId;
    }
    
    return this.find(query)
        .populate('bill', 'name category amount')
        .sort({ paid_date: -1 })
        .limit(limit);
};

billPaymentSchema.statics.getPaymentStats = async function(userId, startDate, endDate) {
    const match = { user: userId, status: 'completed' };
    
    if (startDate && endDate) {
        match.paid_date = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    }
    
    const stats = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                total_paid: { $sum: '$amount' },
                payment_count: { $sum: 1 },
                total_late_fees: { $sum: '$late_fee_amount' },
                avg_payment: { $avg: '$amount' }
            }
        }
    ]);
    
    return stats[0] || {
        total_paid: 0,
        payment_count: 0,
        total_late_fees: 0,
        avg_payment: 0
    };
};

billPaymentSchema.statics.getMonthlyPayments = async function(userId, year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    
    const payments = await this.aggregate([
        {
            $match: {
                user: userId,
                status: 'completed',
                paid_date: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: { $month: '$paid_date' },
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        {
            $sort: { _id: 1 }
        }
    ]);
    
    // Fill in missing months
    const monthlyData = Array(12).fill(0).map((_, i) => ({
        month: i + 1,
        total: 0,
        count: 0
    }));
    
    payments.forEach(item => {
        monthlyData[item._id - 1] = {
            month: item._id,
            total: item.total,
            count: item.count
        };
    });
    
    return monthlyData;
};

module.exports = mongoose.model('BillPayment', billPaymentSchema);
