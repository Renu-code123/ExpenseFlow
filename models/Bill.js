const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Bill Details
    name: {
        type: String,
        required: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'USD',
        uppercase: true
    },
    
    // Due Date and Frequency
    due_date: {
        type: Date,
        required: true,
        index: true
    },
    frequency: {
        type: String,
        enum: ['once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'],
        default: 'monthly',
        required: true
    },
    
    // Category and Payee
    category: {
        type: String,
        required: true,
        trim: true
    },
    payee: {
        type: String,
        required: true,
        trim: true
    },
    
    // Account Association
    account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account'
    },
    
    // Auto Payment
    auto_pay: {
        enabled: {
            type: Boolean,
            default: false
        },
        method: String,
        account_number_last4: String
    },
    
    // Reminder Configuration
    reminder_days: {
        type: [Number],
        default: [7, 3, 1] // Days before due date
    },
    
    // Status
    status: {
        type: String,
        enum: ['active', 'paid', 'overdue', 'cancelled', 'paused'],
        default: 'active',
        index: true
    },
    
    // Payment Tracking
    last_paid: Date,
    next_due_date: Date,
    
    // Payment History Summary
    total_paid: {
        type: Number,
        default: 0
    },
    payment_count: {
        type: Number,
        default: 0
    },
    
    // Additional Info
    description: String,
    notes: String,
    website_url: String,
    phone_number: String,
    
    // Notification Settings
    notifications: {
        email: {
            type: Boolean,
            default: true
        },
        push: {
            type: Boolean,
            default: true
        },
        sms: {
            type: Boolean,
            default: false
        }
    },
    
    // Tags
    tags: [String],
    
    // Recurring Bill Tracking
    is_recurring: {
        type: Boolean,
        default: true
    },
    end_date: Date, // For recurring bills that should stop
    
    // Late Fee Information
    late_fee: {
        amount: Number,
        grace_period_days: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true
});

// Indexes
billSchema.index({ user: 1, status: 1 });
billSchema.index({ user: 1, due_date: 1 });
billSchema.index({ user: 1, next_due_date: 1 });
billSchema.index({ user: 1, category: 1 });

// Virtual for days until due
billSchema.virtual('days_until_due').get(function() {
    if (!this.next_due_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(this.next_due_date);
    dueDate.setHours(0, 0, 0, 0);
    const diffTime = dueDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for overdue status
billSchema.virtual('is_overdue').get(function() {
    if (this.status === 'paid') return false;
    return this.days_until_due < 0;
});

// Pre-save middleware
billSchema.pre('save', function(next) {
    // Set next_due_date if not set
    if (!this.next_due_date && this.due_date) {
        this.next_due_date = this.due_date;
    }
    
    // Update status based on due date
    if (this.status !== 'paid' && this.status !== 'cancelled' && this.status !== 'paused') {
        const daysUntilDue = this.days_until_due;
        if (daysUntilDue < 0) {
            this.status = 'overdue';
        } else {
            this.status = 'active';
        }
    }
    
    next();
});

// Methods
billSchema.methods.recordPayment = async function(paymentData) {
    const BillPayment = mongoose.model('BillPayment');
    
    // Create payment record
    const payment = new BillPayment({
        user: this.user,
        bill: this._id,
        amount: paymentData.amount || this.amount,
        paid_date: paymentData.paid_date || new Date(),
        payment_method: paymentData.payment_method,
        confirmation_number: paymentData.confirmation_number,
        notes: paymentData.notes
    });
    
    await payment.save();
    
    // Update bill
    this.last_paid = payment.paid_date;
    this.status = 'paid';
    this.total_paid += payment.amount;
    this.payment_count += 1;
    
    // Calculate next due date for recurring bills
    if (this.is_recurring && this.frequency !== 'once') {
        this.next_due_date = this.calculateNextDueDate();
        this.status = 'active'; // Reset to active for next cycle
    }
    
    await this.save();
    
    return payment;
};

billSchema.methods.calculateNextDueDate = function() {
    const currentDue = new Date(this.next_due_date || this.due_date);
    let nextDue = new Date(currentDue);
    
    switch (this.frequency) {
        case 'weekly':
            nextDue.setDate(nextDue.getDate() + 7);
            break;
        case 'biweekly':
            nextDue.setDate(nextDue.getDate() + 14);
            break;
        case 'monthly':
            nextDue.setMonth(nextDue.getMonth() + 1);
            break;
        case 'quarterly':
            nextDue.setMonth(nextDue.getMonth() + 3);
            break;
        case 'yearly':
            nextDue.setFullYear(nextDue.getFullYear() + 1);
            break;
        case 'once':
            return null;
    }
    
    return nextDue;
};

billSchema.methods.skip = async function() {
    if (this.frequency === 'once') {
        throw new Error('Cannot skip one-time bill');
    }
    
    this.next_due_date = this.calculateNextDueDate();
    this.status = 'active';
    await this.save();
    
    return this;
};

billSchema.methods.pause = async function() {
    this.status = 'paused';
    await this.save();
    return this;
};

billSchema.methods.resume = async function() {
    this.status = 'active';
    await this.save();
    return this;
};

// Static methods
billSchema.statics.getUpcomingBills = function(userId, days = 30) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + days);
    
    return this.find({
        user: userId,
        status: { $in: ['active', 'overdue'] },
        next_due_date: {
            $gte: today,
            $lte: futureDate
        }
    }).sort({ next_due_date: 1 });
};

billSchema.statics.getOverdueBills = function(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.find({
        user: userId,
        status: 'overdue',
        next_due_date: { $lt: today }
    }).sort({ next_due_date: 1 });
};

billSchema.statics.getDueToday = function(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return this.find({
        user: userId,
        status: { $in: ['active', 'overdue'] },
        next_due_date: {
            $gte: today,
            $lt: tomorrow
        }
    });
};

billSchema.statics.getBillsByCategory = async function(userId) {
    return this.aggregate([
        {
            $match: {
                user: userId,
                status: { $in: ['active', 'overdue'] }
            }
        },
        {
            $group: {
                _id: '$category',
                total_amount: { $sum: '$amount' },
                count: { $sum: 1 },
                bills: { $push: '$$ROOT' }
            }
        },
        {
            $sort: { total_amount: -1 }
        }
    ]);
};

billSchema.statics.getMonthlyTotal = async function(userId) {
    const result = await this.aggregate([
        {
            $match: {
                user: userId,
                status: { $in: ['active', 'overdue'] },
                frequency: { $ne: 'once' }
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$amount' }
            }
        }
    ]);
    
    return result[0]?.total || 0;
};

billSchema.statics.getBillsNeedingReminders = async function() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const bills = await this.find({
        status: 'active',
        next_due_date: { $gte: today }
    }).populate('user');
    
    const billsNeedingReminders = [];
    
    for (const bill of bills) {
        const daysUntilDue = bill.days_until_due;
        
        // Check if reminder should be sent
        if (bill.reminder_days.includes(daysUntilDue)) {
            billsNeedingReminders.push({
                bill,
                days_until_due: daysUntilDue
            });
        }
    }
    
    return billsNeedingReminders;
};

module.exports = mongoose.model('Bill', billSchema);
