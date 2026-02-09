const mongoose = require('mongoose');

const spendingPatternSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    pattern_type: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'seasonal', 'merchant', 'category'],
        required: true
    },
    category: {
        type: String,
        enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other']
    },
    merchant: {
        type: String,
        trim: true
    },
    frequency: {
        type: String,
        enum: ['very_frequent', 'frequent', 'occasional', 'rare'],
        default: 'occasional'
    },
    average_amount: {
        type: Number,
        required: true,
        min: 0
    },
    median_amount: {
        type: Number,
        min: 0
    },
    min_amount: {
        type: Number,
        min: 0
    },
    max_amount: {
        type: Number,
        min: 0
    },
    transaction_count: {
        type: Number,
        default: 0
    },
    time_pattern: {
        hour_of_day: Number,
        day_of_week: Number,
        day_of_month: Number,
        preferred_time: String
    },
    trend: {
        type: String,
        enum: ['increasing', 'decreasing', 'stable', 'volatile'],
        default: 'stable'
    },
    confidence_score: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.5
    },
    last_occurrence: {
        type: Date
    },
    next_predicted_date: {
        type: Date
    },
    prediction_accuracy: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    anomaly_threshold: {
        lower: Number,
        upper: Number
    },
    isActive: {
        type: Boolean,
        default: true
    },
    metadata: {
        sample_transactions: [mongoose.Schema.Types.ObjectId],
        seasonality: String,
        day_preferences: [Number],
        notes: String
    }
}, {
    timestamps: true
});

// Indexes
spendingPatternSchema.index({ user: 1, pattern_type: 1 });
spendingPatternSchema.index({ user: 1, category: 1 });
spendingPatternSchema.index({ user: 1, merchant: 1 });

// Check if amount is anomalous
spendingPatternSchema.methods.isAnomalous = function(amount) {
    if (!this.anomaly_threshold) return false;
    return amount < this.anomaly_threshold.lower || amount > this.anomaly_threshold.upper;
};

// Update pattern with new transaction
spendingPatternSchema.methods.updateWithTransaction = function(amount, date) {
    this.transaction_count += 1;
    this.last_occurrence = date;
    
    // Update average (moving average)
    const weight = 0.8;
    this.average_amount = (this.average_amount * weight) + (amount * (1 - weight));
    
    // Update min/max
    this.min_amount = Math.min(this.min_amount || amount, amount);
    this.max_amount = Math.max(this.max_amount || amount, amount);
    
    return this.save();
};

// Get active patterns for user
spendingPatternSchema.statics.getActivePatterns = function(userId) {
    return this.find({ user: userId, isActive: true })
        .sort({ confidence_score: -1, transaction_count: -1 });
};

// Get patterns by category
spendingPatternSchema.statics.getByCategory = function(userId, category) {
    return this.find({ user: userId, category, isActive: true })
        .sort({ transaction_count: -1 });
};

module.exports = mongoose.model('SpendingPattern', spendingPatternSchema);
