const mongoose = require('mongoose');

const reminderScheduleSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Related Entity
    related_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'related_model',
        index: true
    },
    related_model: {
        type: String,
        required: true,
        enum: ['Bill', 'CalendarEvent', 'Goal', 'Budget']
    },
    
    // Reminder Type
    reminder_type: {
        type: String,
        required: true,
        enum: ['bill_due', 'bill_overdue', 'payment_scheduled', 'goal_deadline', 'budget_limit', 'custom']
    },
    
    // Schedule Details
    scheduled_date: {
        type: Date,
        required: true,
        index: true
    },
    
    // Notification Methods
    methods: [{
        type: {
            type: String,
            enum: ['email', 'push', 'sms', 'in_app']
        },
        enabled: {
            type: Boolean,
            default: true
        }
    }],
    
    // Message Content
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    
    // Status
    status: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'cancelled'],
        default: 'pending',
        index: true
    },
    sent_at: Date,
    
    // Delivery Status
    delivery_status: [{
        method: String,
        status: String,
        sent_at: Date,
        error: String
    }],
    
    // Priority
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    
    // Retry Configuration
    retry_count: {
        type: Number,
        default: 0
    },
    max_retries: {
        type: Number,
        default: 3
    },
    
    // Additional Data
    metadata: mongoose.Schema.Types.Mixed
}, {
    timestamps: true
});

// Indexes
reminderScheduleSchema.index({ user: 1, status: 1, scheduled_date: 1 });
reminderScheduleSchema.index({ related_id: 1, related_model: 1 });
reminderScheduleSchema.index({ scheduled_date: 1, status: 1 });

// Methods
reminderScheduleSchema.methods.markAsSent = async function() {
    this.status = 'sent';
    this.sent_at = new Date();
    await this.save();
    return this;
};

reminderScheduleSchema.methods.markAsFailed = async function(error) {
    this.status = 'failed';
    this.metadata = this.metadata || {};
    this.metadata.error = error;
    this.retry_count += 1;
    await this.save();
    return this;
};

reminderScheduleSchema.methods.cancel = async function() {
    this.status = 'cancelled';
    await this.save();
    return this;
};

// Static methods
reminderScheduleSchema.statics.getPendingReminders = function() {
    const now = new Date();
    
    return this.find({
        status: 'pending',
        scheduled_date: { $lte: now }
    })
        .populate('user')
        .populate('related_id')
        .sort({ priority: -1, scheduled_date: 1 });
};

reminderScheduleSchema.statics.getFailedReminders = function() {
    return this.find({
        status: 'failed',
        retry_count: { $lt: this.schema.path('max_retries').defaultValue }
    })
        .populate('user')
        .populate('related_id')
        .sort({ scheduled_date: 1 });
};

reminderScheduleSchema.statics.createBillReminder = async function(bill, daysBeforeDue) {
    const reminderDate = new Date(bill.next_due_date);
    reminderDate.setDate(reminderDate.getDate() - daysBeforeDue);
    reminderDate.setHours(9, 0, 0, 0); // 9 AM reminder
    
    // Don't create if in the past
    if (reminderDate < new Date()) {
        return null;
    }
    
    const User = mongoose.model('User');
    const user = await User.findById(bill.user);
    
    let title, message, priority;
    
    if (daysBeforeDue === 0) {
        title = `Bill Due Today: ${bill.name}`;
        message = `Your bill "${bill.name}" of ${bill.currency} ${bill.amount} is due today!`;
        priority = 'high';
    } else if (daysBeforeDue === 1) {
        title = `Bill Due Tomorrow: ${bill.name}`;
        message = `Your bill "${bill.name}" of ${bill.currency} ${bill.amount} is due tomorrow.`;
        priority = 'medium';
    } else {
        title = `Upcoming Bill: ${bill.name}`;
        message = `Your bill "${bill.name}" of ${bill.currency} ${bill.amount} is due in ${daysBeforeDue} days.`;
        priority = 'low';
    }
    
    const reminder = new this({
        user: bill.user,
        related_id: bill._id,
        related_model: 'Bill',
        reminder_type: 'bill_due',
        scheduled_date: reminderDate,
        methods: [
            { type: 'email', enabled: bill.notifications.email },
            { type: 'push', enabled: bill.notifications.push },
            { type: 'sms', enabled: bill.notifications.sms }
        ],
        title,
        message,
        priority,
        metadata: {
            bill_name: bill.name,
            amount: bill.amount,
            currency: bill.currency,
            due_date: bill.next_due_date,
            days_before: daysBeforeDue,
            category: bill.category,
            payee: bill.payee
        }
    });
    
    return reminder.save();
};

reminderScheduleSchema.statics.createOverdueReminder = async function(bill) {
    const User = mongoose.model('User');
    const user = await User.findById(bill.user);
    
    const daysOverdue = Math.abs(bill.days_until_due);
    
    const reminder = new this({
        user: bill.user,
        related_id: bill._id,
        related_model: 'Bill',
        reminder_type: 'bill_overdue',
        scheduled_date: new Date(),
        methods: [
            { type: 'email', enabled: bill.notifications.email },
            { type: 'push', enabled: bill.notifications.push },
            { type: 'sms', enabled: bill.notifications.sms }
        ],
        title: `Overdue Bill: ${bill.name}`,
        message: `Your bill "${bill.name}" of ${bill.currency} ${bill.amount} is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue!`,
        priority: 'urgent',
        metadata: {
            bill_name: bill.name,
            amount: bill.amount,
            currency: bill.currency,
            due_date: bill.next_due_date,
            days_overdue: daysOverdue,
            category: bill.category,
            payee: bill.payee
        }
    });
    
    return reminder.save();
};

reminderScheduleSchema.statics.syncBillReminders = async function(billId) {
    const Bill = mongoose.model('Bill');
    const bill = await Bill.findById(billId);
    
    if (!bill || bill.status === 'cancelled' || bill.status === 'paused') {
        // Remove existing reminders
        await this.deleteMany({
            related_id: billId,
            related_model: 'Bill',
            status: 'pending'
        });
        return [];
    }
    
    // Remove old reminders
    await this.deleteMany({
        related_id: billId,
        related_model: 'Bill',
        status: 'pending'
    });
    
    // Create new reminders
    const reminders = [];
    for (const days of bill.reminder_days) {
        const reminder = await this.createBillReminder(bill, days);
        if (reminder) {
            reminders.push(reminder);
        }
    }
    
    return reminders;
};

module.exports = mongoose.model('ReminderSchedule', reminderScheduleSchema);
