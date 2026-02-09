const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
    description: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 1
    },
    unit_price: {
        type: Number,
        required: true,
        min: 0
    },
    discount: {
        type: Number,
        default: 0,
        min: 0
    },
    discount_type: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage'
    },
    tax_rate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    amount: Number // Calculated
});

const invoiceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
        index: true
    },
    
    // Invoice Details
    invoice_number: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    invoice_date: {
        type: Date,
        required: true,
        default: Date.now
    },
    due_date: {
        type: Date,
        required: true
    },
    
    // Items
    items: [invoiceItemSchema],
    
    // Financial Details
    currency: {
        type: String,
        required: true,
        default: 'USD',
        uppercase: true
    },
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    tax_amount: {
        type: Number,
        default: 0,
        min: 0
    },
    tax_rate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    discount_amount: {
        type: Number,
        default: 0,
        min: 0
    },
    late_fee: {
        type: Number,
        default: 0,
        min: 0
    },
    total: {
        type: Number,
        required: true,
        min: 0
    },
    amount_paid: {
        type: Number,
        default: 0,
        min: 0
    },
    amount_due: {
        type: Number,
        required: true
    },
    
    // Status
    status: {
        type: String,
        enum: ['draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled', 'refunded'],
        default: 'draft',
        index: true
    },
    paid_date: Date,
    
    // Recurring Invoice
    is_recurring: {
        type: Boolean,
        default: false
    },
    recurring_config: {
        frequency: {
            type: String,
            enum: ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']
        },
        next_invoice_date: Date,
        end_date: Date,
        auto_send: {
            type: Boolean,
            default: false
        },
        occurrences_remaining: Number,
        parent_invoice: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Invoice'
        }
    },
    
    // Project and Time Tracking
    project_name: String,
    project_description: String,
    time_entries: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TimeEntry'
    }],
    expenses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Expense'
    }],
    
    // Terms and Notes
    terms: String,
    notes: String,
    internal_notes: String,
    
    // Payment Information
    payment_methods_accepted: [{
        type: String,
        enum: ['bank_transfer', 'paypal', 'stripe', 'cash', 'check', 'other']
    }],
    payment_instructions: String,
    
    // Reminders
    reminders_sent: [{
        date: Date,
        type: {
            type: String,
            enum: ['before_due', 'due_today', 'overdue']
        },
        days_overdue: Number
    }],
    
    // PDF and Email
    pdf_url: String,
    pdf_generated_at: Date,
    sent_at: Date,
    viewed_at: Date,
    
    // Template
    template_id: String,
    
    // Custom Fields
    custom_fields: mongoose.Schema.Types.Mixed,
    
    // Tags
    tags: [String]
}, {
    timestamps: true
});

// Indexes
invoiceSchema.index({ user: 1, status: 1 });
invoiceSchema.index({ user: 1, client: 1 });
invoiceSchema.index({ user: 1, invoice_date: -1 });
invoiceSchema.index({ user: 1, due_date: 1 });
invoiceSchema.index({ 'recurring_config.next_invoice_date': 1 });

// Pre-save middleware to calculate amounts
invoiceItemSchema.pre('save', function(next) {
    let itemTotal = this.quantity * this.unit_price;
    
    // Apply discount
    if (this.discount > 0) {
        if (this.discount_type === 'percentage') {
            itemTotal -= (itemTotal * this.discount / 100);
        } else {
            itemTotal -= this.discount;
        }
    }
    
    // Apply tax
    if (this.tax_rate > 0) {
        itemTotal += (itemTotal * this.tax_rate / 100);
    }
    
    this.amount = Math.round(itemTotal * 100) / 100;
    next();
});

invoiceSchema.pre('save', function(next) {
    // Calculate subtotal from items
    if (this.items && this.items.length > 0) {
        this.subtotal = this.items.reduce((sum, item) => {
            const itemSubtotal = item.quantity * item.unit_price;
            const discountAmount = item.discount_type === 'percentage' 
                ? itemSubtotal * item.discount / 100 
                : item.discount;
            return sum + (itemSubtotal - discountAmount);
        }, 0);
        
        // Calculate total tax
        this.tax_amount = this.items.reduce((sum, item) => {
            const itemSubtotal = item.quantity * item.unit_price;
            const discountAmount = item.discount_type === 'percentage' 
                ? itemSubtotal * item.discount / 100 
                : item.discount;
            const taxableAmount = itemSubtotal - discountAmount;
            return sum + (taxableAmount * item.tax_rate / 100);
        }, 0);
    }
    
    // Calculate total
    this.total = this.subtotal + this.tax_amount + this.late_fee - this.discount_amount;
    this.amount_due = this.total - this.amount_paid;
    
    // Round to 2 decimals
    this.subtotal = Math.round(this.subtotal * 100) / 100;
    this.tax_amount = Math.round(this.tax_amount * 100) / 100;
    this.total = Math.round(this.total * 100) / 100;
    this.amount_due = Math.round(this.amount_due * 100) / 100;
    
    // Update status based on payment
    if (this.amount_paid >= this.total && this.status !== 'paid') {
        this.status = 'paid';
        this.paid_date = new Date();
    } else if (this.amount_paid > 0 && this.amount_paid < this.total) {
        this.status = 'partially_paid';
    }
    
    // Check if overdue
    if (this.status !== 'paid' && this.status !== 'cancelled' && this.due_date < new Date()) {
        this.status = 'overdue';
    }
    
    next();
});

// Virtuals
invoiceSchema.virtual('days_overdue').get(function() {
    if (this.status === 'paid' || this.status === 'cancelled') return 0;
    if (this.due_date > new Date()) return 0;
    
    const diff = Date.now() - this.due_date.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
});

invoiceSchema.virtual('days_until_due').get(function() {
    if (this.status === 'paid' || this.status === 'cancelled') return null;
    
    const diff = this.due_date.getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Methods
invoiceSchema.methods.recordPayment = async function(amount, paymentMethod, transactionId, notes) {
    this.amount_paid += amount;
    this.amount_due = this.total - this.amount_paid;
    
    if (this.amount_paid >= this.total) {
        this.status = 'paid';
        this.paid_date = new Date();
    } else {
        this.status = 'partially_paid';
    }
    
    // Create payment record
    const Payment = mongoose.model('Payment');
    const payment = new Payment({
        user: this.user,
        invoice: this._id,
        client: this.client,
        amount: amount,
        currency: this.currency,
        payment_method: paymentMethod,
        transaction_id: transactionId,
        payment_date: new Date(),
        notes: notes
    });
    
    await payment.save();
    await this.save();
    
    return payment;
};

invoiceSchema.methods.applyLateFee = async function() {
    if (this.status === 'paid' || this.status === 'cancelled') return this;
    if (this.late_fee > 0) return this; // Already applied
    
    const daysOverdue = this.days_overdue;
    if (daysOverdue <= 0) return this;
    
    const Client = mongoose.model('Client');
    const client = await Client.findById(this.client);
    
    if (!client || !client.late_fee.enabled) return this;
    if (daysOverdue < client.late_fee.days_after_due) return this;
    
    if (client.late_fee.type === 'percentage') {
        this.late_fee = this.subtotal * client.late_fee.amount / 100;
    } else {
        this.late_fee = client.late_fee.amount;
    }
    
    this.late_fee = Math.round(this.late_fee * 100) / 100;
    await this.save();
    
    return this;
};

invoiceSchema.methods.markAsSent = async function() {
    if (this.status === 'draft') {
        this.status = 'sent';
    }
    this.sent_at = new Date();
    return this.save();
};

invoiceSchema.methods.markAsViewed = async function() {
    if (!this.viewed_at) {
        this.viewed_at = new Date();
        if (this.status === 'sent') {
            this.status = 'viewed';
        }
        return this.save();
    }
    return this;
};

invoiceSchema.methods.cancel = async function(reason) {
    this.status = 'cancelled';
    this.internal_notes = (this.internal_notes || '') + `\nCancelled: ${reason}`;
    return this.save();
};

// Static methods
invoiceSchema.statics.generateInvoiceNumber = async function(userId) {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    
    const lastInvoice = await this.findOne({
        user: userId,
        invoice_number: new RegExp(`^${prefix}`)
    }).sort({ invoice_number: -1 });
    
    if (!lastInvoice) {
        return `${prefix}0001`;
    }
    
    const lastNumber = parseInt(lastInvoice.invoice_number.split('-').pop());
    const nextNumber = (lastNumber + 1).toString().padStart(4, '0');
    
    return `${prefix}${nextNumber}`;
};

invoiceSchema.statics.getOverdueInvoices = function(userId) {
    return this.find({
        user: userId,
        status: { $in: ['sent', 'viewed', 'partially_paid', 'overdue'] },
        due_date: { $lt: new Date() }
    }).populate('client');
};

invoiceSchema.statics.getUpcomingInvoices = function(userId, days = 7) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    return this.find({
        user: userId,
        status: { $in: ['sent', 'viewed', 'partially_paid'] },
        due_date: { $gte: new Date(), $lte: futureDate }
    }).populate('client');
};

invoiceSchema.statics.getRecurringInvoicesToGenerate = function() {
    return this.find({
        is_recurring: true,
        'recurring_config.next_invoice_date': { $lte: new Date() },
        status: { $ne: 'cancelled' }
    }).populate('client user');
};

invoiceSchema.statics.getUserStats = async function(userId, startDate, endDate) {
    const match = { user: userId };
    
    if (startDate && endDate) {
        match.invoice_date = { $gte: startDate, $lte: endDate };
    }
    
    const stats = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                total_amount: { $sum: '$total' },
                paid_amount: { $sum: '$amount_paid' }
            }
        }
    ]);
    
    const summary = {
        total_invoices: 0,
        total_amount: 0,
        paid_amount: 0,
        outstanding_amount: 0,
        by_status: {}
    };
    
    stats.forEach(stat => {
        summary.total_invoices += stat.count;
        summary.total_amount += stat.total_amount;
        summary.paid_amount += stat.paid_amount;
        summary.by_status[stat._id] = {
            count: stat.count,
            amount: stat.total_amount
        };
    });
    
    summary.outstanding_amount = summary.total_amount - summary.paid_amount;
    
    return summary;
};

module.exports = mongoose.model('Invoice', invoiceSchema);
