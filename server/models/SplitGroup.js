const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    nickname: {
        type: String,
        trim: true
    },
    role: {
        type: String,
        enum: ['admin', 'member'],
        default: 'member'
    },
    status: {
        type: String,
        enum: ['active', 'invited', 'removed'],
        default: 'active'
    },
    joined_at: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const splitGroupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Group name is required'],
        trim: true,
        maxlength: [100, 'Group name cannot exceed 100 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    avatar: {
        type: String,
        default: null
    },
    currency: {
        type: String,
        default: 'INR',
        uppercase: true
    },
    members: [memberSchema],
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    settings: {
        simplify_debts: {
            type: Boolean,
            default: true
        },
        auto_settle_threshold: {
            type: Number,
            default: null
        },
        require_receipt: {
            type: Boolean,
            default: false
        }
    },
    category: {
        type: String,
        enum: ['trip', 'home', 'couple', 'friends', 'project', 'event', 'other'],
        default: 'friends'
    },
    is_active: {
        type: Boolean,
        default: true
    },
    archived_at: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Indexes
splitGroupSchema.index({ 'members.user': 1 });
splitGroupSchema.index({ 'members.email': 1 });
splitGroupSchema.index({ created_by: 1 });
splitGroupSchema.index({ is_active: 1 });

// Virtual for member count
splitGroupSchema.virtual('member_count').get(function() {
    return this.members.filter(m => m.status === 'active').length;
});

// Virtual for pending invites
splitGroupSchema.virtual('pending_invites').get(function() {
    return this.members.filter(m => m.status === 'invited').length;
});

// Instance methods

/**
 * Add member to group
 */
splitGroupSchema.methods.addMember = async function(userData, role = 'member') {
    const existingMember = this.members.find(
        m => m.email === userData.email.toLowerCase()
    );
    
    if (existingMember) {
        if (existingMember.status === 'removed') {
            existingMember.status = 'active';
            existingMember.joined_at = new Date();
        } else {
            throw new Error('Member already exists in this group');
        }
    } else {
        this.members.push({
            user: userData.userId || null,
            email: userData.email.toLowerCase(),
            nickname: userData.nickname || null,
            role: role,
            status: userData.userId ? 'active' : 'invited'
        });
    }
    
    await this.save();
    return this;
};

/**
 * Remove member from group
 */
splitGroupSchema.methods.removeMember = async function(email) {
    const member = this.members.find(m => m.email === email.toLowerCase());
    
    if (!member) {
        throw new Error('Member not found');
    }
    
    if (member.role === 'admin' && this.getAdminCount() === 1) {
        throw new Error('Cannot remove the last admin');
    }
    
    member.status = 'removed';
    await this.save();
    
    return this;
};

/**
 * Update member role
 */
splitGroupSchema.methods.updateMemberRole = async function(email, newRole) {
    const member = this.members.find(m => m.email === email.toLowerCase());
    
    if (!member) {
        throw new Error('Member not found');
    }
    
    if (member.role === 'admin' && newRole !== 'admin' && this.getAdminCount() === 1) {
        throw new Error('Cannot demote the last admin');
    }
    
    member.role = newRole;
    await this.save();
    
    return this;
};

/**
 * Get admin count
 */
splitGroupSchema.methods.getAdminCount = function() {
    return this.members.filter(m => m.role === 'admin' && m.status === 'active').length;
};

/**
 * Check if user is member
 */
splitGroupSchema.methods.isMember = function(userId) {
    return this.members.some(
        m => m.user && m.user.toString() === userId.toString() && m.status === 'active'
    );
};

/**
 * Check if user is admin
 */
splitGroupSchema.methods.isAdmin = function(userId) {
    return this.members.some(
        m => m.user && m.user.toString() === userId.toString() && 
        m.role === 'admin' && m.status === 'active'
    );
};

/**
 * Archive group
 */
splitGroupSchema.methods.archive = async function() {
    this.is_active = false;
    this.archived_at = new Date();
    await this.save();
    return this;
};

/**
 * Unarchive group
 */
splitGroupSchema.methods.unarchive = async function() {
    this.is_active = true;
    this.archived_at = null;
    await this.save();
    return this;
};

// Static methods

/**
 * Get user's groups
 */
splitGroupSchema.statics.getUserGroups = async function(userId, includeArchived = false) {
    const query = {
        'members.user': userId,
        'members.status': 'active'
    };
    
    if (!includeArchived) {
        query.is_active = true;
    }
    
    return await this.find(query)
        .populate('created_by', 'name email')
        .sort({ updatedAt: -1 });
};

/**
 * Get groups by email
 */
splitGroupSchema.statics.getGroupsByEmail = async function(email) {
    return await this.find({
        'members.email': email.toLowerCase(),
        'members.status': 'active',
        is_active: true
    })
        .populate('created_by', 'name email')
        .sort({ updatedAt: -1 });
};

/**
 * Get active members
 */
splitGroupSchema.methods.getActiveMembers = function() {
    return this.members.filter(m => m.status === 'active');
};

// Pre-save middleware
splitGroupSchema.pre('save', function(next) {
    // Ensure at least one admin
    const activeAdmins = this.members.filter(
        m => m.role === 'admin' && m.status === 'active'
    );
    
    if (activeAdmins.length === 0 && this.members.length > 0) {
        // Make the creator an admin
        const creator = this.members.find(
            m => m.user && m.user.toString() === this.created_by.toString()
        );
        if (creator) {
            creator.role = 'admin';
        }
    }
    
    next();
});

// Enable virtuals in JSON
splitGroupSchema.set('toJSON', { virtuals: true });
splitGroupSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('SplitGroup', splitGroupSchema);
