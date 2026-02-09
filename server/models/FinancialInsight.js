const mongoose = require('mongoose');

const financialInsightSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: [
            'anomaly',
            'pattern',
            'forecast',
            'recommendation',
            'health_score',
            'subscription_alert',
            'bill_optimization',
            'peer_comparison'
        ],
        required: true
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other'],
        default: 'other'
    },
    confidence: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.5
    },
    amount: {
        type: Number,
        default: 0
    },
    savings_potential: {
        type: Number,
        default: 0
    },
    metadata: {
        transaction_id: mongoose.Schema.Types.ObjectId,
        merchant: String,
        pattern_type: String,
        forecast_period: String,
        anomaly_score: Number,
        comparison_data: mongoose.Schema.Types.Mixed,
        recommendations: [String]
    },
    isRead: {
        type: Boolean,
        default: false
    },
    isActioned: {
        type: Boolean,
        default: false
    },
    actionTaken: {
        type: String,
        trim: true
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    }
}, {
    timestamps: true
});

// Indexes for performance
financialInsightSchema.index({ user: 1, type: 1, createdAt: -1 });
financialInsightSchema.index({ user: 1, isRead: 1 });
financialInsightSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Mark as read
financialInsightSchema.methods.markAsRead = function() {
    this.isRead = true;
    return this.save();
};

// Mark as actioned
financialInsightSchema.methods.markAsActioned = function(action) {
    this.isActioned = true;
    this.actionTaken = action;
    return this.save();
};

// Get unread count for user
financialInsightSchema.statics.getUnreadCount = function(userId) {
    return this.countDocuments({ user: userId, isRead: false });
};

// Get insights by type
financialInsightSchema.statics.getByType = function(userId, type, limit = 10) {
    return this.find({ user: userId, type })
        .sort({ createdAt: -1 })
        .limit(limit);
};

// Get critical insights
financialInsightSchema.statics.getCriticalInsights = function(userId) {
    return this.find({
        user: userId,
        severity: { $in: ['high', 'critical'] },
        isRead: false
    }).sort({ severity: -1, createdAt: -1 });
};

module.exports = mongoose.model('FinancialInsight', financialInsightSchema);
