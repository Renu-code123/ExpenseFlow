const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Event Type
    type: {
        type: String,
        required: true,
        enum: [
            'bill_due',
            'bill_overdue',
            'payment_scheduled',
            'payment_completed',
            'goal_deadline',
            'goal_milestone',
            'budget_review',
            'income_expected',
            'subscription_renewal',
            'custom'
        ],
        index: true
    },
    
    // Related Entity
    related_id: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'related_model'
    },
    related_model: {
        type: String,
        enum: ['Bill', 'BillPayment', 'Goal', 'Budget', 'Expense', 'Income']
    },
    
    // Event Details
    title: {
        type: String,
        required: true
    },
    description: String,
    date: {
        type: Date,
        required: true,
        index: true
    },
    end_date: Date,
    
    // All-day event flag
    all_day: {
        type: Boolean,
        default: true
    },
    
    // Metadata
    metadata: {
        amount: Number,
        currency: String,
        category: String,
        status: String,
        payee: String,
        custom_fields: mongoose.Schema.Types.Mixed
    },
    
    // Visual Properties
    color: {
        type: String,
        default: '#3788d8' // Default blue
    },
    icon: String,
    
    // Priority
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    
    // Reminder Settings
    reminders: [{
        type: {
            type: String,
            enum: ['notification', 'email', 'sms']
        },
        minutes_before: Number,
        sent: {
            type: Boolean,
            default: false
        },
        sent_at: Date
    }],
    
    // Status
    status: {
        type: String,
        enum: ['scheduled', 'completed', 'cancelled', 'missed'],
        default: 'scheduled'
    },
    
    // Recurrence
    is_recurring: {
        type: Boolean,
        default: false
    },
    recurrence: {
        frequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'yearly']
        },
        interval: {
            type: Number,
            default: 1
        },
        end_date: Date,
        occurrences: Number
    },
    
    // Notes
    notes: String,
    
    // Tags
    tags: [String]
}, {
    timestamps: true
});

// Indexes
calendarEventSchema.index({ user: 1, date: 1 });
calendarEventSchema.index({ user: 1, type: 1, date: 1 });
calendarEventSchema.index({ user: 1, status: 1 });
calendarEventSchema.index({ related_id: 1, related_model: 1 });

// Methods
calendarEventSchema.methods.markCompleted = async function() {
    this.status = 'completed';
    await this.save();
    return this;
};

calendarEventSchema.methods.markCancelled = async function() {
    this.status = 'cancelled';
    await this.save();
    return this;
};

// Static methods
calendarEventSchema.statics.getEventsForDateRange = function(userId, startDate, endDate, filters = {}) {
    const query = {
        user: userId,
        date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        }
    };
    
    if (filters.type) {
        if (Array.isArray(filters.type)) {
            query.type = { $in: filters.type };
        } else {
            query.type = filters.type;
        }
    }
    
    if (filters.status) {
        query.status = filters.status;
    }
    
    if (filters.priority) {
        query.priority = filters.priority;
    }
    
    return this.find(query)
        .populate('related_id')
        .sort({ date: 1 });
};

calendarEventSchema.statics.getMonthEvents = function(userId, year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    return this.getEventsForDateRange(userId, startDate, endDate);
};

calendarEventSchema.statics.getTodayEvents = function(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return this.find({
        user: userId,
        date: {
            $gte: today,
            $lt: tomorrow
        },
        status: { $ne: 'cancelled' }
    }).sort({ date: 1, priority: -1 });
};

calendarEventSchema.statics.getUpcomingEvents = function(userId, days = 7) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + days);
    
    return this.find({
        user: userId,
        date: {
            $gte: today,
            $lte: futureDate
        },
        status: 'scheduled'
    }).sort({ date: 1 });
};

calendarEventSchema.statics.createFromBill = async function(bill) {
    const event = new this({
        user: bill.user,
        type: bill.status === 'overdue' ? 'bill_overdue' : 'bill_due',
        related_id: bill._id,
        related_model: 'Bill',
        title: `${bill.name} - Due`,
        description: `Payment due for ${bill.name}`,
        date: bill.next_due_date,
        metadata: {
            amount: bill.amount,
            currency: bill.currency,
            category: bill.category,
            status: bill.status,
            payee: bill.payee
        },
        color: bill.status === 'overdue' ? '#e74c3c' : '#3788d8',
        priority: bill.status === 'overdue' ? 'urgent' : 'high'
    });
    
    return event.save();
};

calendarEventSchema.statics.createFromPayment = async function(payment, bill) {
    const event = new this({
        user: payment.user,
        type: 'payment_completed',
        related_id: payment._id,
        related_model: 'BillPayment',
        title: `${bill.name} - Paid`,
        description: `Payment completed for ${bill.name}`,
        date: payment.paid_date,
        metadata: {
            amount: payment.amount,
            category: bill.category,
            status: 'completed',
            payee: bill.payee,
            payment_method: payment.payment_method
        },
        color: '#27ae60',
        status: 'completed'
    });
    
    return event.save();
};

calendarEventSchema.statics.syncBillEvents = async function(userId) {
    const Bill = mongoose.model('Bill');
    const bills = await Bill.find({
        user: userId,
        status: { $in: ['active', 'overdue'] }
    });
    
    // Remove old bill events
    await this.deleteMany({
        user: userId,
        type: { $in: ['bill_due', 'bill_overdue'] },
        date: { $gte: new Date() }
    });
    
    // Create new events
    const events = [];
    for (const bill of bills) {
        const event = await this.createFromBill(bill);
        events.push(event);
    }
    
    return events;
};

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);
