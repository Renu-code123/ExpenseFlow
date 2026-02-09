const mongoose = require('mongoose');

const approvalRequestSchema = new mongoose.Schema({
    space: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SharedSpace',
        required: true,
        index: true
    },
    requester: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    expense_data: {
        description: {
            type: String,
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        category: String,
        date: Date,
        notes: String,
        receipt_url: String
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'cancelled'],
        default: 'pending',
        index: true
    },
    approvals: [{
        approver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        decision: {
            type: String,
            enum: ['approved', 'rejected'],
            required: true
        },
        comment: String,
        decided_at: {
            type: Date,
            default: Date.now
        }
    }],
    required_approvals: {
        type: Number,
        default: 1
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    notes: String,
    final_decision_at: Date,
    final_decision_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    expense_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Expense'
    },
    expires_at: {
        type: Date,
        default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }
}, {
    timestamps: true
});

// Indexes
approvalRequestSchema.index({ space: 1, status: 1 });
approvalRequestSchema.index({ requester: 1 });
approvalRequestSchema.index({ 'approvals.approver': 1 });
approvalRequestSchema.index({ expires_at: 1 });

// Virtual: approval progress
approvalRequestSchema.virtual('approval_progress').get(function() {
    const approved = this.approvals.filter(a => a.decision === 'approved').length;
    return `${approved}/${this.required_approvals}`;
});

// Virtual: is fully approved
approvalRequestSchema.virtual('is_fully_approved').get(function() {
    const approvedCount = this.approvals.filter(a => a.decision === 'approved').length;
    return approvedCount >= this.required_approvals;
});

// Virtual: is rejected
approvalRequestSchema.virtual('is_rejected').get(function() {
    return this.approvals.some(a => a.decision === 'rejected');
});

// Methods
approvalRequestSchema.methods.addApproval = async function(approverId, decision, comment) {
    // Check if already approved by this user
    const existing = this.approvals.find(a => a.approver.toString() === approverId.toString());
    if (existing) {
        throw new Error('User has already provided approval decision');
    }
    
    // Add approval
    this.approvals.push({
        approver: approverId,
        decision,
        comment,
        decided_at: new Date()
    });
    
    // Check if rejected
    if (decision === 'rejected') {
        this.status = 'rejected';
        this.final_decision_at = new Date();
        this.final_decision_by = approverId;
    }
    // Check if fully approved
    else if (this.is_fully_approved) {
        this.status = 'approved';
        this.final_decision_at = new Date();
        this.final_decision_by = approverId;
    }
    
    return this.save();
};

approvalRequestSchema.methods.cancel = async function() {
    if (this.status !== 'pending') {
        throw new Error('Can only cancel pending requests');
    }
    
    this.status = 'cancelled';
    this.final_decision_at = new Date();
    return this.save();
};

approvalRequestSchema.methods.hasUserApproved = function(userId) {
    return this.approvals.some(a => 
        a.approver.toString() === userId.toString() && a.decision === 'approved'
    );
};

// Static methods
approvalRequestSchema.statics.getPendingForSpace = function(spaceId) {
    return this.find({ space: spaceId, status: 'pending' })
        .populate('requester', 'name email')
        .populate('approvals.approver', 'name')
        .sort({ priority: -1, createdAt: 1 });
};

approvalRequestSchema.statics.getPendingForApprover = function(approverId, spaceId) {
    return this.find({
        space: spaceId,
        status: 'pending',
        'approvals.approver': { $ne: approverId }
    })
        .populate('requester', 'name email')
        .sort({ priority: -1, createdAt: 1 });
};

approvalRequestSchema.statics.getUserRequests = function(userId) {
    return this.find({ requester: userId })
        .populate('space', 'name')
        .populate('approvals.approver', 'name')
        .sort({ createdAt: -1 });
};

// Auto-expire pending requests
approvalRequestSchema.pre('save', function(next) {
    if (this.status === 'pending' && this.expires_at < new Date()) {
        this.status = 'cancelled';
        this.final_decision_at = new Date();
    }
    next();
});

module.exports = mongoose.model('ApprovalRequest', approvalRequestSchema);
