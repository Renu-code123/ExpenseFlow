const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    workspace: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        default: null // null means global for the user
    },
    isGlobal: {
        type: Boolean,
        default: function () { return !this.workspace; }
    },
    overridesRule: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Rule',
        default: null // If this is a workspace-level override of a global rule
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    trigger: {
        field: {
            type: String,
            required: true,
            enum: ['description', 'amount', 'category', 'type', 'merchant']
        },
        operator: {
            type: String,
            required: true,
            enum: ['contains', 'equals', 'greater_than', 'less_than', 'starts_with', 'ends_with']
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            required: true
        }
    },
    actions: [{
        type: {
            type: String,
            required: true,
            enum: ['auto_categorize', 'add_tag', 'flag_for_review', 'move_to_workspace']
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            required: true
        }
    }],
    lastExecuted: {
        type: Date
    },
    executionCount: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Rule', ruleSchema);
