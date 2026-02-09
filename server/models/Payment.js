const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    invoice: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice',
        required: true,
        index: true
    },
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
        index: true
    },
    
    // Payment Details
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        required: true,
        default: 'USD',
        uppercase: true
    },
    
    // Payment Method
    payment_method: {
        type: String,
        required: true,
        enum: ['bank_transfer', 'paypal', 'stripe', 'cash', 'check', 'credit_card', 'debit_card', 'other']
    },
    
    // Transaction Details
    transaction_id: String,
    payment_date: {
        type: Date,
        required: true,
        default: Date.now
    },
    
    // Bank/Payment Gateway Details
    payment_details: {
        bank_name: String,
        account_number: String,
        reference_number: String,
        check_number: String,
        gateway: String, // 'paypal', 'stripe', etc.
        gateway_transaction_id: String,
        gateway_fee: Number
    },
    
    // Payment Status
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
        default: 'completed'
    },
    
    // Reconciliation
    reconciled: {
        type: Boolean,
        default: false
    },
    reconciled_date: Date,
    
    // Notes
    notes: String,
    internal_notes: String,
    
    // Receipt
    receipt_number: String,
    receipt_url: String,
    receipt_sent_at: Date,
    
    // Refund Information (if applicable)
    refund: {
        is_refunded: {
            type: Boolean,
            default: false
        },
        refund_amount: Number,
        refund_date: Date,
        refund_reason: String,
        refund_transaction_id: String
    },
    
    // Attachments
    attachments: [{
        filename: String,
        url: String,
        uploaded_at: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Indexes
paymentSchema.index({ user: 1, payment_date: -1 });
paymentSchema.index({ user: 1, client: 1 });
paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ invoice: 1 });

// Pre-save middleware
paymentSchema.pre('save', async function(next) {
    // Generate receipt number if not exists
    if (!this.receipt_number && this.status === 'completed') {
        const year = new Date().getFullYear();
        const prefix = `RCP-${year}-`;
        
        const lastPayment = await this.constructor.findOne({
            user: this.user,
            receipt_number: new RegExp(`^${prefix}`)
        }).sort({ receipt_number: -1 });
        
        if (!lastPayment) {
            this.receipt_number = `${prefix}0001`;
        } else {
            const lastNumber = parseInt(lastPayment.receipt_number.split('-').pop());
            const nextNumber = (lastNumber + 1).toString().padStart(4, '0');
            this.receipt_number = `${prefix}${nextNumber}`;
        }
    }
    
    next();
});

// Methods
paymentSchema.methods.processRefund = async function(refundAmount, reason) {
    if (this.status !== 'completed') {
        throw new Error('Can only refund completed payments');
    }
    
    if (refundAmount > this.amount) {
        throw new Error('Refund amount cannot exceed payment amount');
    }
    
    this.refund = {
        is_refunded: true,
        refund_amount: refundAmount,
        refund_date: new Date(),
        refund_reason: reason
    };
    
    if (refundAmount === this.amount) {
        this.status = 'refunded';
    }
    
    await this.save();
    
    // Update invoice
    const Invoice = mongoose.model('Invoice');
    const invoice = await Invoice.findById(this.invoice);
    
    if (invoice) {
        invoice.amount_paid -= refundAmount;
        invoice.amount_due += refundAmount;
        
        if (invoice.status === 'paid' && invoice.amount_due > 0) {
            invoice.status = 'partially_paid';
        }
        
        await invoice.save();
    }
    
    // Update client
    const Client = mongoose.model('Client');
    const client = await Client.findById(this.client);
    
    if (client) {
        client.total_paid -= refundAmount;
        client.outstanding_balance += refundAmount;
        await client.save();
    }
    
    return this;
};

paymentSchema.methods.markAsReconciled = async function() {
    this.reconciled = true;
    this.reconciled_date = new Date();
    return this.save();
};

paymentSchema.methods.sendReceipt = async function() {
    // This will be implemented in the email service
    this.receipt_sent_at = new Date();
    return this.save();
};

// Static methods
paymentSchema.statics.getUserPayments = function(userId, filters = {}) {
    const query = { user: userId };
    
    if (filters.client) {
        query.client = filters.client;
    }
    
    if (filters.invoice) {
        query.invoice = filters.invoice;
    }
    
    if (filters.status) {
        query.status = filters.status;
    }
    
    if (filters.payment_method) {
        query.payment_method = filters.payment_method;
    }
    
    if (filters.start_date && filters.end_date) {
        query.payment_date = {
            $gte: new Date(filters.start_date),
            $lte: new Date(filters.end_date)
        };
    }
    
    return this.find(query)
        .populate('client', 'name company_name')
        .populate('invoice', 'invoice_number total')
        .sort({ payment_date: -1 });
};

paymentSchema.statics.getUnreconciledPayments = function(userId) {
    return this.find({
        user: userId,
        status: 'completed',
        reconciled: false
    }).populate('client invoice');
};

paymentSchema.statics.getPaymentStats = async function(userId, startDate, endDate) {
    const match = { user: userId, status: 'completed' };
    
    if (startDate && endDate) {
        match.payment_date = { $gte: startDate, $lte: endDate };
    }
    
    const stats = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$payment_method',
                count: { $sum: 1 },
                total_amount: { $sum: '$amount' },
                avg_amount: { $avg: '$amount' }
            }
        }
    ]);
    
    const summary = {
        total_payments: 0,
        total_amount: 0,
        by_method: {}
    };
    
    stats.forEach(stat => {
        summary.total_payments += stat.count;
        summary.total_amount += stat.total_amount;
        summary.by_method[stat._id] = {
            count: stat.count,
            total: stat.total_amount,
            average: stat.avg_amount
        };
    });
    
    return summary;
};

paymentSchema.statics.getMonthlyRevenue = async function(userId, year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    
    const revenue = await this.aggregate([
        {
            $match: {
                user: userId,
                status: 'completed',
                payment_date: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: { $month: '$payment_date' },
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        {
            $sort: { _id: 1 }
        }
    ]);
    
    // Fill in missing months with 0
    const monthlyData = Array(12).fill(0).map((_, i) => ({
        month: i + 1,
        total: 0,
        count: 0
    }));
    
    revenue.forEach(item => {
        monthlyData[item._id - 1] = {
            month: item._id,
            total: item.total,
            count: item.count
        };
    });
    
    return monthlyData;
};

module.exports = mongoose.model('Payment', paymentSchema);
