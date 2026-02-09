const mongoose = require('mongoose');

const sharedSpaceSchema = new mongoose.Schema({
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
    type: {
        type: String,
        enum: ['family', 'couple', 'roommates', 'business', 'friends', 'other'],
        required: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    members: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        role: {
            type: String,
            enum: ['admin', 'manager', 'contributor', 'viewer'],
            default: 'viewer'
        },
        permissions: {
            view_expenses: { type: Boolean, default: true },
            add_expenses: { type: Boolean, default: false },
            edit_expenses: { type: Boolean, default: false },
            delete_expenses: { type: Boolean, default: false },
            view_goals: { type: Boolean, default: true },
            manage_goals: { type: Boolean, default: false },
            view_budgets: { type: Boolean, default: true },
            manage_budgets: { type: Boolean, default: false },
            approve_expenses: { type: Boolean, default: false },
            manage_members: { type: Boolean, default: false },
            view_reports: { type: Boolean, default: true }
        },
        joined_at: {
            type: Date,
            default: Date.now
        },
        invitation_accepted: {
            type: Boolean,
            default: false
        },
        privacy_settings: {
            hide_personal_transactions: { type: Boolean, default: false },
            hide_income: { type: Boolean, default: false },
            hide_savings: { type: Boolean, default: false }
        }
    }],
    settings: {
        require_approval_above: {
            type: Number,
            default: 10000
        },
        approval_threshold_count: {
            type: Number,
            default: 1
        },
        currency: {
            type: String,
            default: 'INR',
            uppercase: true
        },
        notification_settings: {
            new_expense: { type: Boolean, default: true },
            goal_progress: { type: Boolean, default: true },
            budget_alert: { type: Boolean, default: true },
            approval_request: { type: Boolean, default: true },
            member_activity: { type: Boolean, default: false }
        },
        privacy_mode: {
            type: String,
            enum: ['open', 'restricted', 'private'],
            default: 'open'
        }
    },
    invite_code: {
        type: String,
        unique: true,
        sparse: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Indexes
sharedSpaceSchema.index({ owner: 1 });
sharedSpaceSchema.index({ 'members.user': 1 });
sharedSpaceSchema.index({ invite_code: 1 });

// Generate unique invite code
sharedSpaceSchema.methods.generateInviteCode = function() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    this.invite_code = code;
    return code;
};

// Check if user is member
sharedSpaceSchema.methods.isMember = function(userId) {
    return this.members.some(m => m.user.toString() === userId.toString());
};

// Get member
sharedSpaceSchema.methods.getMember = function(userId) {
    return this.members.find(m => m.user.toString() === userId.toString());
};

// Check permission
sharedSpaceSchema.methods.hasPermission = function(userId, permission) {
    const member = this.getMember(userId);
    if (!member) return false;
    
    // Owner has all permissions
    if (this.owner.toString() === userId.toString()) return true;
    
    // Admin role has all permissions
    if (member.role === 'admin') return true;
    
    return member.permissions[permission] === true;
};

// Add member
sharedSpaceSchema.methods.addMember = async function(userId, role = 'viewer') {
    if (this.isMember(userId)) {
        throw new Error('User is already a member');
    }
    
    const permissions = this.getDefaultPermissions(role);
    
    this.members.push({
        user: userId,
        role,
        permissions,
        invitation_accepted: false
    });
    
    return this.save();
};

// Remove member
sharedSpaceSchema.methods.removeMember = async function(userId) {
    if (this.owner.toString() === userId.toString()) {
        throw new Error('Cannot remove owner from space');
    }
    
    this.members = this.members.filter(m => m.user.toString() !== userId.toString());
    return this.save();
};

// Update member role
sharedSpaceSchema.methods.updateMemberRole = async function(userId, newRole) {
    const member = this.getMember(userId);
    if (!member) throw new Error('Member not found');
    
    member.role = newRole;
    member.permissions = this.getDefaultPermissions(newRole);
    
    return this.save();
};

// Get default permissions for role
sharedSpaceSchema.methods.getDefaultPermissions = function(role) {
    const rolePermissions = {
        admin: {
            view_expenses: true,
            add_expenses: true,
            edit_expenses: true,
            delete_expenses: true,
            view_goals: true,
            manage_goals: true,
            view_budgets: true,
            manage_budgets: true,
            approve_expenses: true,
            manage_members: true,
            view_reports: true
        },
        manager: {
            view_expenses: true,
            add_expenses: true,
            edit_expenses: true,
            delete_expenses: false,
            view_goals: true,
            manage_goals: true,
            view_budgets: true,
            manage_budgets: true,
            approve_expenses: true,
            manage_members: false,
            view_reports: true
        },
        contributor: {
            view_expenses: true,
            add_expenses: true,
            edit_expenses: true,
            delete_expenses: false,
            view_goals: true,
            manage_goals: false,
            view_budgets: true,
            manage_budgets: false,
            approve_expenses: false,
            manage_members: false,
            view_reports: true
        },
        viewer: {
            view_expenses: true,
            add_expenses: false,
            edit_expenses: false,
            delete_expenses: false,
            view_goals: true,
            manage_goals: false,
            view_budgets: true,
            manage_budgets: false,
            approve_expenses: false,
            manage_members: false,
            view_reports: true
        }
    };
    
    return rolePermissions[role] || rolePermissions.viewer;
};

// Get spaces for user
sharedSpaceSchema.statics.getUserSpaces = function(userId) {
    return this.find({
        $or: [
            { owner: userId },
            { 'members.user': userId }
        ],
        isActive: true
    }).populate('owner', 'name email')
      .populate('members.user', 'name email');
};

module.exports = mongoose.model('SharedSpace', sharedSpaceSchema);
