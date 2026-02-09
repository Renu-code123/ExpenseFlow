const mongoose = require('mongoose');

const spendingAnomalySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    expense_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Expense'
    },
    detection_date: {
        type: Date,
        default: Date.now,
        index: true
    },
    anomaly_type: {
        type: String,
        enum: [
            'amount_spike',
            'unusual_merchant',
            'frequency_anomaly',
            'category_mismatch',
            'time_anomaly',
            'duplicate_transaction',
            'location_anomaly',
            'velocity_anomaly'
        ],
        required: true
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium',
        index: true
    },
    anomaly_details: {
        transaction_amount: Number,
        expected_amount: Number,
        deviation_percentage: Number,
        merchant: String,
        category: String,
        date: Date,
        description: String
    },
    statistical_analysis: {
        z_score: Number,
        percentile: Number,
        standard_deviations: Number,
        historical_average: Number,
        historical_std_dev: Number,
        confidence_score: {
            type: Number,
            min: 0,
            max: 100
        }
    },
    context: {
        similar_transactions_count: Number,
        last_similar_transaction: Date,
        category_average: Number,
        merchant_history: {
            total_transactions: Number,
            average_amount: Number,
            last_transaction_date: Date
        }
    },
    flags: {
        is_potential_fraud: {
            type: Boolean,
            default: false
        },
        is_duplicate: {
            type: Boolean,
            default: false
        },
        is_budget_impact: {
            type: Boolean,
            default: false
        },
        requires_review: {
            type: Boolean,
            default: true
        }
    },
    user_actions: {
        reviewed: {
            type: Boolean,
            default: false
        },
        reviewed_at: Date,
        marked_as_normal: {
            type: Boolean,
            default: false
        },
        flagged_as_fraud: {
            type: Boolean,
            default: false
        },
        notes: String
    },
    alert_sent: {
        email: {
            type: Boolean,
            default: false
        },
        push: {
            type: Boolean,
            default: false
        },
        in_app: {
            type: Boolean,
            default: false
        },
        sent_at: Date
    },
    recommendations: [{
        action: {
            type: String,
            enum: ['verify_transaction', 'update_budget', 'review_category', 'contact_merchant', 'report_fraud']
        },
        description: String
    }],
    resolution: {
        resolved: {
            type: Boolean,
            default: false
        },
        resolved_at: Date,
        resolution_type: {
            type: String,
            enum: ['confirmed_normal', 'confirmed_fraud', 'corrected', 'ignored']
        },
        resolution_notes: String
    }
}, {
    timestamps: true
});

// Indexes
spendingAnomalySchema.index({ user: 1, detection_date: -1 });
spendingAnomalySchema.index({ user: 1, severity: 1, 'user_actions.reviewed': 1 });
spendingAnomalySchema.index({ 'flags.is_potential_fraud': 1, 'user_actions.reviewed': 1 });

// Virtuals
spendingAnomalySchema.virtual('days_since_detection').get(function() {
    const diff = new Date() - this.detection_date;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
});

spendingAnomalySchema.virtual('requires_urgent_attention').get(function() {
    return (this.severity === 'critical' || this.flags.is_potential_fraud) && 
           !this.user_actions.reviewed;
});

// Methods
spendingAnomalySchema.methods.markAsReviewed = function(notes = null) {
    this.user_actions.reviewed = true;
    this.user_actions.reviewed_at = new Date();
    if (notes) {
        this.user_actions.notes = notes;
    }
    return this.save();
};

spendingAnomalySchema.methods.markAsNormal = function() {
    this.user_actions.marked_as_normal = true;
    this.flags.requires_review = false;
    this.resolution = {
        resolved: true,
        resolved_at: new Date(),
        resolution_type: 'confirmed_normal'
    };
    return this.save();
};

spendingAnomalySchema.methods.markAsFraud = function(notes) {
    this.user_actions.flagged_as_fraud = true;
    this.flags.is_potential_fraud = true;
    this.resolution = {
        resolved: true,
        resolved_at: new Date(),
        resolution_type: 'confirmed_fraud',
        resolution_notes: notes
    };
    return this.save();
};

spendingAnomalySchema.methods.sendAlert = function(channels = ['email', 'in_app']) {
    channels.forEach(channel => {
        if (this.alert_sent[channel] !== undefined) {
            this.alert_sent[channel] = true;
        }
    });
    this.alert_sent.sent_at = new Date();
    return this.save();
};

spendingAnomalySchema.methods.addRecommendation = function(action, description) {
    this.recommendations.push({ action, description });
    return this.save();
};

// Static methods
spendingAnomalySchema.statics.getUserAnomalies = function(userId, options = {}) {
    const query = { user: userId };
    
    if (options.severity) {
        query.severity = options.severity;
    }
    
    if (options.unreviewed) {
        query['user_actions.reviewed'] = false;
    }
    
    if (options.potentialFraud) {
        query['flags.is_potential_fraud'] = true;
    }
    
    return this.find(query)
        .sort({ detection_date: -1 })
        .populate('expense_id');
};

spendingAnomalySchema.statics.getUnreviewedCritical = function(userId) {
    return this.find({
        user: userId,
        severity: { $in: ['high', 'critical'] },
        'user_actions.reviewed': false,
        'resolution.resolved': false
    }).sort({ detection_date: -1 });
};

spendingAnomalySchema.statics.getRecentAnomalies = function(userId, days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return this.find({
        user: userId,
        detection_date: { $gte: cutoffDate }
    }).sort({ detection_date: -1 });
};

spendingAnomalySchema.statics.getAnomalyStats = async function(userId, period = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - period);
    
    const anomalies = await this.find({
        user: userId,
        detection_date: { $gte: cutoffDate }
    });
    
    return {
        total: anomalies.length,
        by_severity: {
            low: anomalies.filter(a => a.severity === 'low').length,
            medium: anomalies.filter(a => a.severity === 'medium').length,
            high: anomalies.filter(a => a.severity === 'high').length,
            critical: anomalies.filter(a => a.severity === 'critical').length
        },
        by_type: anomalies.reduce((acc, a) => {
            acc[a.anomaly_type] = (acc[a.anomaly_type] || 0) + 1;
            return acc;
        }, {}),
        unreviewed: anomalies.filter(a => !a.user_actions.reviewed).length,
        potential_fraud: anomalies.filter(a => a.flags.is_potential_fraud).length,
        resolved: anomalies.filter(a => a.resolution.resolved).length
    };
};

module.exports = mongoose.model('SpendingAnomaly', spendingAnomalySchema);
