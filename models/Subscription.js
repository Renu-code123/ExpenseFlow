const mongoose = require('mongoose');

/**
 * Subscription Model
 * Issue #647: Enhanced with State Machine and Predictive Lifecycle Tracking
 */
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
        trim: true,
        index: true
    },
    category: {
        type: String,
        enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'software', 'music', 'fitness', 'other'],
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
    billingCycle: {
        type: String,
        enum: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semi_annual', 'yearly'],
        required: true,
        default: 'monthly'
    },
    nextPaymentDate: {
        type: Date,
        required: true,
        index: true
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: Date,

    // State Machine logic
    status: {
        type: String,
        enum: ['active', 'trial', 'paused', 'cancelled', 'expired', 'grace_period'],
        default: 'active',
        index: true
    },

    // Trial Management
    isInTrial: {
        type: Boolean,
        default: false
    },
    trialEndDate: Date,
    trialReminderSent: {
        type: Boolean,
        default: false
    },

    // Automated Processing
    lastPaymentDate: Date,
    totalSpent: {
        type: Number,
        default: 0
    },
    paymentCount: {
        type: Number,
        default: 0
    },

    // Usage Tracking
    lastUsedDate: Date,
    usageFrequency: {
        type: String,
        enum: ['high', 'medium', 'low', 'none'],
        default: 'medium'
    },

    // Configuration
    reminderEnabled: {
        type: Boolean,
        default: true
    },
    reminderDaysBefore: {
        type: Number,
        default: 3
    },
    reminderSent: {
        type: Boolean,
        default: false
    },

    // Metadata & Intelligence
    isAutoDetected: {
        type: Boolean,
        default: false
    },
    detectionConfidence: Number,
    valueRating: {
        type: Number,
        min: 1,
        max: 5,
        default: 3
    },
    logo: String,
    website: String,
    notes: String,
    tags: [String],

    // Lifecycle History
    history: [{
        action: String,
        fromStatus: String,
        toStatus: String,
        timestamp: { type: Date, default: Date.now },
        note: String
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
subscriptionSchema.index({ user: 1, status: 1, nextPaymentDate: 1 });
subscriptionSchema.index({ status: 1, trialEndDate: 1 });

// Virtuals
subscriptionSchema.virtual('monthlyAmount').get(function () {
    const weights = {
        daily: 30,
        weekly: 4.33,
        biweekly: 2.16,
        monthly: 1,
        quarterly: 1 / 3,
        semi_annual: 1 / 6,
        yearly: 1 / 12
    };
    return (this.amount * (weights[this.billingCycle] || 1));
});

subscriptionSchema.virtual('yearlyAmount').get(function () {
    return this.monthlyAmount * 12;
});

subscriptionSchema.virtual('daysUntilPayment').get(function () {
    if (!this.nextPaymentDate) return null;
    return Math.ceil((this.nextPaymentDate - new Date()) / (1000 * 60 * 60 * 24));
});

subscriptionSchema.virtual('daysUntilTrialEnds').get(function () {
    if (!this.trialEndDate) return null;
    return Math.ceil((this.trialEndDate - new Date()) / (1000 * 60 * 60 * 24));
});

// State Transition Helper
subscriptionSchema.methods.transitionTo = function (newStatus, note = '') {
    const oldStatus = this.status;
    if (oldStatus === newStatus) return;

    this.status = newStatus;
    this.history.push({
        action: 'status_change',
        fromStatus: oldStatus,
        toStatus: newStatus,
        note
    });
};

// Calculate next payment date
subscriptionSchema.methods.calculateNextPaymentDate = function () {
    const base = this.nextPaymentDate || new Date();
    const next = new Date(base);

    switch (this.billingCycle) {
        case 'daily': next.setDate(next.getDate() + 1); break;
        case 'weekly': next.setDate(next.getDate() + 7); break;
        case 'biweekly': next.setDate(next.getDate() + 14); break;
        case 'monthly': next.setMonth(next.getMonth() + 1); break;
        case 'quarterly': next.setMonth(next.getMonth() + 3); break;
        case 'semi_annual': next.setMonth(next.getMonth() + 6); break;
        case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
    }
    return next;
};

// Logic for whether reminder should be sent
subscriptionSchema.methods.shouldSendReminder = function () {
    if (!this.reminderEnabled || this.reminderSent || this.status !== 'active') return false;
    const days = this.daysUntilPayment;
    return days !== null && days <= this.reminderDaysBefore && days >= 0;
};

subscriptionSchema.methods.shouldSendTrialReminder = function () {
    if (this.status !== 'trial' || this.trialReminderSent || !this.trialEndDate) return false;
    const days = this.daysUntilTrialEnds;
    return days !== null && days <= 3 && days >= 0;
};

// Static: Find unused subscriptions
subscriptionSchema.statics.findUnused = function (userId) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return this.find({
        user: userId,
        status: 'active',
        $or: [
            { lastUsedDate: { $lt: thirtyDaysAgo } },
            { lastUsedDate: { $exists: false } }
        ]
    });
};

// Static: Get upcoming for auto-billing background task
subscriptionSchema.statics.getUpcomingForProcess = function () {
    const now = new Date();
    return this.find({
        status: { $in: ['active', 'trial', 'grace_period'] },
        nextPaymentDate: { $lte: now }
    });
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
