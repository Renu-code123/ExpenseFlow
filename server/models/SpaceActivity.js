const mongoose = require('mongoose');

const spaceActivitySchema = new mongoose.Schema({
    space: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SharedSpace',
        required: true,
        index: true
    },
    actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        enum: [
            'member_added',
            'member_removed',
            'member_role_changed',
            'expense_added',
            'expense_edited',
            'expense_deleted',
            'goal_created',
            'goal_updated',
            'goal_completed',
            'contribution_made',
            'budget_created',
            'budget_updated',
            'approval_requested',
            'approval_granted',
            'approval_denied',
            'settings_changed',
            'space_created',
            'space_archived'
        ],
        required: true
    },
    target_type: {
        type: String,
        enum: ['expense', 'goal', 'budget', 'member', 'space', 'approval']
    },
    target_id: mongoose.Schema.Types.ObjectId,
    details: {
        old_value: mongoose.Schema.Types.Mixed,
        new_value: mongoose.Schema.Types.Mixed,
        amount: Number,
        description: String,
        member_name: String,
        role: String
    },
    metadata: {
        ip_address: String,
        user_agent: String,
        device_type: String
    }
}, {
    timestamps: true
});

// Indexes
spaceActivitySchema.index({ space: 1, createdAt: -1 });
spaceActivitySchema.index({ actor: 1 });
spaceActivitySchema.index({ action: 1 });

// Static methods
spaceActivitySchema.statics.logActivity = async function(data) {
    return this.create(data);
};

spaceActivitySchema.statics.getSpaceActivity = function(spaceId, limit = 50, skip = 0) {
    return this.find({ space: spaceId })
        .populate('actor', 'name email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);
};

spaceActivitySchema.statics.getUserActivity = function(userId, limit = 50) {
    return this.find({ actor: userId })
        .populate('space', 'name type')
        .sort({ createdAt: -1 })
        .limit(limit);
};

module.exports = mongoose.model('SpaceActivity', spaceActivitySchema);
