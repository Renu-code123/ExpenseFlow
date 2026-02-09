const mongoose = require('mongoose');

const sharedGoalSchema = new mongoose.Schema({
    space: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SharedSpace',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    target_amount: {
        type: Number,
        required: true,
        min: 0
    },
    current_amount: {
        type: Number,
        default: 0,
        min: 0
    },
    currency: {
        type: String,
        default: 'INR',
        uppercase: true
    },
    deadline: {
        type: Date
    },
    category: {
        type: String,
        enum: ['savings', 'investment', 'purchase', 'vacation', 'emergency', 'education', 'other'],
        default: 'savings'
    },
    contributors: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        target_contribution: {
            type: Number,
            default: 0
        },
        current_contribution: {
            type: Number,
            default: 0
        },
        contribution_percentage: {
            type: Number,
            default: 0
        },
        last_contribution_date: Date
    }],
    contributions: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        date: {
            type: Date,
            default: Date.now
        },
        note: String,
        transaction_id: mongoose.Schema.Types.ObjectId
    }],
    status: {
        type: String,
        enum: ['active', 'completed', 'paused', 'cancelled'],
        default: 'active'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    visibility: {
        type: String,
        enum: ['all', 'contributors', 'admins'],
        default: 'all'
    },
    auto_allocate: {
        type: Boolean,
        default: false
    },
    allocation_rule: {
        type: String,
        enum: ['equal', 'proportional', 'custom'],
        default: 'equal'
    },
    milestone_alerts: [{
        percentage: Number,
        triggered: { type: Boolean, default: false }
    }],
    completed_at: Date,
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Indexes
sharedGoalSchema.index({ space: 1, status: 1 });
sharedGoalSchema.index({ 'contributors.user': 1 });

// Virtuals
sharedGoalSchema.virtual('progress_percentage').get(function() {
    if (this.target_amount === 0) return 0;
    return Math.min((this.current_amount / this.target_amount) * 100, 100);
});

sharedGoalSchema.virtual('remaining_amount').get(function() {
    return Math.max(this.target_amount - this.current_amount, 0);
});

sharedGoalSchema.virtual('days_remaining').get(function() {
    if (!this.deadline) return null;
    const diff = this.deadline - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Methods
sharedGoalSchema.methods.addContribution = async function(userId, amount, note, transactionId) {
    // Add to contributions array
    this.contributions.push({
        user: userId,
        amount,
        date: new Date(),
        note,
        transaction_id: transactionId
    });
    
    // Update current amount
    this.current_amount += amount;
    
    // Update contributor's contribution
    let contributor = this.contributors.find(c => c.user.toString() === userId.toString());
    
    if (!contributor) {
        // Add new contributor
        this.contributors.push({
            user: userId,
            current_contribution: amount,
            last_contribution_date: new Date()
        });
    } else {
        contributor.current_contribution += amount;
        contributor.last_contribution_date = new Date();
    }
    
    // Check if goal completed
    if (this.current_amount >= this.target_amount && this.status === 'active') {
        this.status = 'completed';
        this.completed_at = new Date();
    }
    
    // Check milestone alerts
    const progress = this.progress_percentage;
    this.milestone_alerts.forEach(milestone => {
        if (!milestone.triggered && progress >= milestone.percentage) {
            milestone.triggered = true;
        }
    });
    
    return this.save();
};

sharedGoalSchema.methods.updateContributorTargets = async function(allocations) {
    const totalTarget = this.target_amount;
    
    if (this.allocation_rule === 'equal') {
        const perPerson = totalTarget / allocations.length;
        allocations.forEach(userId => {
            let contributor = this.contributors.find(c => c.user.toString() === userId.toString());
            if (contributor) {
                contributor.target_contribution = perPerson;
                contributor.contribution_percentage = (perPerson / totalTarget) * 100;
            } else {
                this.contributors.push({
                    user: userId,
                    target_contribution: perPerson,
                    contribution_percentage: (perPerson / totalTarget) * 100,
                    current_contribution: 0
                });
            }
        });
    } else if (this.allocation_rule === 'custom') {
        // Custom allocations provided in format: [{ userId, amount }]
        allocations.forEach(alloc => {
            let contributor = this.contributors.find(c => c.user.toString() === alloc.userId.toString());
            if (contributor) {
                contributor.target_contribution = alloc.amount;
                contributor.contribution_percentage = (alloc.amount / totalTarget) * 100;
            } else {
                this.contributors.push({
                    user: alloc.userId,
                    target_contribution: alloc.amount,
                    contribution_percentage: (alloc.amount / totalTarget) * 100,
                    current_contribution: 0
                });
            }
        });
    }
    
    return this.save();
};

// Static methods
sharedGoalSchema.statics.getSpaceGoals = function(spaceId, status = 'active') {
    return this.find({ space: spaceId, status })
        .populate('contributors.user', 'name email')
        .populate('contributions.user', 'name')
        .populate('created_by', 'name')
        .sort({ priority: -1, createdAt: -1 });
};

sharedGoalSchema.statics.getUserGoals = function(userId) {
    return this.find({
        'contributors.user': userId,
        status: { $in: ['active', 'paused'] }
    })
        .populate('space', 'name type')
        .populate('contributors.user', 'name')
        .sort({ deadline: 1 });
};

module.exports = mongoose.model('SharedGoal', sharedGoalSchema);
