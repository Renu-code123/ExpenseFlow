const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    merchant: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other'],
        default: 'other'
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'INR',
        uppercase: true
    },
    billing_cycle: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
        required: true,
        default: 'monthly'
    },
    billing_day: {
        type: Number,
        min: 1,
        max: 31
    },
    next_billing_date: {
        type: Date,
        required: true
    },
    last_billing_date: {
        type: Date
    },
    detection_method: {
        type: String,
        enum: ['auto', 'manual'],
        default: 'auto'
    },
    confidence_score: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.8
    },
    status: {
        type: String,
        enum: ['active', 'cancelled', 'paused', 'trial'],
        default: 'active'
    },
    trial_end_date: {
        type: Date
    },
    cancellation_date: {
        type: Date
    },
    transaction_history: [{
        transaction_id: mongoose.Schema.Types.ObjectId,
        amount: Number,
        date: Date
    }],
    reminder_sent: {
        type: Boolean,
        default: false
    },
    reminder_date: {
        type: Date
    },
    notes: {
        type: String,
        trim: true,
        maxlength: 500
    },
    metadata: {
        website: String,
        support_email: String,
        cancellation_difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard']
        },
        value_rating: Number,
        usage_frequency: String,
        alternative_suggestions: [String]
    }
}, {
    timestamps: true
});

// Indexes
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ user: 1, next_billing_date: 1 });
subscriptionSchema.index({ next_billing_date: 1, status: 1 });

// Virtual: Annual cost
subscriptionSchema.virtual('annual_cost').get(function() {
    const multipliers = {
        daily: 365,
        weekly: 52,
        monthly: 12,
        quarterly: 4,
        yearly: 1
    };
    return this.amount * (multipliers[this.billing_cycle] || 12);
});

// Virtual: Days until next billing
subscriptionSchema.virtual('days_until_billing').get(function() {
    if (!this.next_billing_date) return null;
    const diff = this.next_billing_date - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Calculate next billing date
subscriptionSchema.methods.calculateNextBillingDate = function() {
    const currentDate = this.next_billing_date || new Date();
    const nextDate = new Date(currentDate);
    
    switch (this.billing_cycle) {
        case 'daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
        case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
        case 'quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
        case 'yearly':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
    }
    
    this.next_billing_date = nextDate;
    return nextDate;
};

// Mark as billed
subscriptionSchema.methods.markAsBilled = function(transactionId, amount) {
    this.last_billing_date = new Date();
    this.transaction_history.push({
        transaction_id: transactionId,
        amount: amount,
        date: new Date()
    });
    this.calculateNextBillingDate();
    this.reminder_sent = false;
    return this.save();
};

// Cancel subscription
subscriptionSchema.methods.cancel = function(reason) {
    this.status = 'cancelled';
    this.cancellation_date = new Date();
    if (reason) this.notes = reason;
    return this.save();
};

// Get upcoming subscriptions (next 7 days)
subscriptionSchema.statics.getUpcoming = function(userId, days = 7) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    return this.find({
        user: userId,
        status: 'active',
        next_billing_date: {
            $gte: new Date(),
            $lte: futureDate
        }
    }).sort({ next_billing_date: 1 });
};

// Get total monthly cost
subscriptionSchema.statics.getTotalMonthlyCost = async function(userId) {
    const subscriptions = await this.find({ user: userId, status: 'active' });
    
    const monthlyEquivalents = {
        daily: 30,
        weekly: 4.33,
        monthly: 1,
        quarterly: 0.33,
        yearly: 0.083
    };
    
    return subscriptions.reduce((total, sub) => {
        return total + (sub.amount * (monthlyEquivalents[sub.billing_cycle] || 1));
    }, 0);
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
