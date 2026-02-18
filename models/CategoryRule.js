const mongoose = require('mongoose');

const categoryRuleSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    pattern: {
        type: String,
        required: true,
        trim: true,
        description: 'Regex or keyword pattern to match against merchant/description'
    },
    isRegex: {
        type: Boolean,
        default: false
    },
    fieldToMatch: {
        type: String,
        enum: ['merchant', 'description', 'both'],
        default: 'both'
    },
    suggestedCategory: {
        type: String,
        required: true,
        enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'education', 'travel', 'other']
    },
    suggestedTags: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tag'
    }],
    confidenceScore: {
        type: Number,
        default: 1.0,
        min: 0,
        max: 1
    },
    priority: {
        type: Number,
        default: 0,
        description: 'Higher priority rules are evaluated first'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    matchCount: {
        type: Number,
        default: 0
    },
    lastMatchedAt: {
        type: Date
    }
}, {
    timestamps: true
});

categoryRuleSchema.index({ user: 1, priority: -1 });

module.exports = mongoose.model('CategoryRule', categoryRuleSchema);
