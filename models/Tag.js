const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    color: {
        type: String,
        default: '#64ffda'
    },
    icon: {
        type: String,
        default: 'tag'
    },
    description: {
        type: String,
        trim: true
    },
    categoryMappings: [{
        type: String,
        enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'education', 'travel', 'other']
    }],
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsed: {
        type: Date
    },
    isAutoApplied: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

tagSchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Tag', tagSchema);
