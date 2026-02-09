const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    client_type: {
        type: String,
        enum: ['individual', 'company'],
        default: 'individual'
    },
    // Basic Information
    name: {
        type: String,
        required: true,
        trim: true
    },
    company_name: String,
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    phone: String,
    website: String,
    
    // Address
    address: {
        street: String,
        city: String,
        state: String,
        postal_code: String,
        country: String
    },
    
    // Business Details
    tax_id: String,
    currency: {
        type: String,
        default: 'USD',
        uppercase: true
    },
    payment_terms: {
        type: Number,
        default: 30, // days
        min: 0
    },
    
    // Financial Summary
    total_billed: {
        type: Number,
        default: 0
    },
    total_paid: {
        type: Number,
        default: 0
    },
    outstanding_balance: {
        type: Number,
        default: 0
    },
    
    // Statistics
    invoice_count: {
        type: Number,
        default: 0
    },
    last_invoice_date: Date,
    last_payment_date: Date,
    average_payment_time: Number, // days
    
    // Settings
    billing_rate: {
        hourly_rate: Number,
        daily_rate: Number,
        project_rate: Number
    },
    late_fee: {
        enabled: {
            type: Boolean,
            default: false
        },
        type: {
            type: String,
            enum: ['percentage', 'fixed'],
            default: 'percentage'
        },
        amount: {
            type: Number,
            default: 0
        },
        days_after_due: {
            type: Number,
            default: 7
        }
    },
    
    // Client Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'blacklisted'],
        default: 'active'
    },
    
    // Notes and Tags
    notes: String,
    tags: [String],
    
    // Contacts
    contacts: [{
        name: String,
        email: String,
        phone: String,
        role: String,
        is_primary: {
            type: Boolean,
            default: false
        }
    }],
    
    // Preferences
    preferences: {
        send_invoice_copy: {
            type: Boolean,
            default: true
        },
        send_payment_reminders: {
            type: Boolean,
            default: true
        },
        invoice_template: String,
        custom_fields: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Indexes
clientSchema.index({ user: 1, status: 1 });
clientSchema.index({ user: 1, email: 1 });
clientSchema.index({ user: 1, name: 1 });

// Virtuals
clientSchema.virtual('payment_status').get(function() {
    if (this.outstanding_balance === 0) return 'paid';
    if (this.outstanding_balance > 0) return 'outstanding';
    return 'overpaid';
});

clientSchema.virtual('lifetime_value').get(function() {
    return this.total_billed;
});

// Methods
clientSchema.methods.updateFinancials = async function(invoiceAmount, paymentAmount = 0) {
    this.total_billed += invoiceAmount;
    this.total_paid += paymentAmount;
    this.outstanding_balance = this.total_billed - this.total_paid;
    this.invoice_count += 1;
    this.last_invoice_date = new Date();
    
    if (paymentAmount > 0) {
        this.last_payment_date = new Date();
    }
    
    return this.save();
};

clientSchema.methods.recordPayment = async function(amount) {
    this.total_paid += amount;
    this.outstanding_balance -= amount;
    this.last_payment_date = new Date();
    
    return this.save();
};

clientSchema.methods.calculateAveragePaymentTime = async function() {
    const Invoice = mongoose.model('Invoice');
    const invoices = await Invoice.find({
        client: this._id,
        status: 'paid',
        paid_date: { $exists: true }
    });
    
    if (invoices.length === 0) return null;
    
    const totalDays = invoices.reduce((sum, inv) => {
        const days = (inv.paid_date - inv.invoice_date) / (1000 * 60 * 60 * 24);
        return sum + days;
    }, 0);
    
    this.average_payment_time = Math.round(totalDays / invoices.length);
    await this.save();
    
    return this.average_payment_time;
};

// Static methods
clientSchema.statics.getUserClients = function(userId, filters = {}) {
    const query = { user: userId };
    
    if (filters.status) {
        query.status = filters.status;
    }
    
    if (filters.search) {
        query.$or = [
            { name: new RegExp(filters.search, 'i') },
            { company_name: new RegExp(filters.search, 'i') },
            { email: new RegExp(filters.search, 'i') }
        ];
    }
    
    return this.find(query).sort({ name: 1 });
};

clientSchema.statics.getTopClients = function(userId, limit = 10) {
    return this.find({ user: userId, status: 'active' })
        .sort({ total_billed: -1 })
        .limit(limit);
};

clientSchema.statics.getClientsWithOutstandingBalance = function(userId) {
    return this.find({
        user: userId,
        status: 'active',
        outstanding_balance: { $gt: 0 }
    }).sort({ outstanding_balance: -1 });
};

module.exports = mongoose.model('Client', clientSchema);
