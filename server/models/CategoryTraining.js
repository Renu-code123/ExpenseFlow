const mongoose = require('mongoose');

const categoryTrainingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    category: {
        type: String,
        required: true,
        enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other']
    },
    merchant: {
        type: String,
        trim: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    confidence: {
        type: Number,
        default: 1.0,
        min: 0,
        max: 1
    },
    source: {
        type: String,
        enum: ['user_input', 'auto_categorized', 'user_correction'],
        default: 'user_input'
    },
    isProcessed: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
categoryTrainingSchema.index({ user: 1, isProcessed: 1 });
categoryTrainingSchema.index({ user: 1, category: 1 });
categoryTrainingSchema.index({ user: 1, date: -1 });

// Static method to get unprocessed training data for a user
categoryTrainingSchema.statics.getUnprocessedData = async function(userId, limit = 1000) {
    return await this.find({
        user: userId,
        isProcessed: false
    })
    .sort({ date: -1 })
    .limit(limit);
};

// Static method to mark data as processed
categoryTrainingSchema.statics.markAsProcessed = async function(userId, dataIds) {
    return await this.updateMany(
        { _id: { $in: dataIds }, user: userId },
        { $set: { isProcessed: true } }
    );
};

// Static method to get training data for ML model
categoryTrainingSchema.statics.getTrainingData = async function(userId, limit = 5000) {
    return await this.find({
        user: userId,
        isProcessed: true
    })
    .sort({ date: -1 })
    .limit(limit);
};

module.exports = mongoose.model('CategoryTraining', categoryTrainingSchema);
