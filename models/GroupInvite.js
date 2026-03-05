const mongoose = require('mongoose');
const crypto = require('crypto');

const groupInviteSchema = new mongoose.Schema({
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SplitGroup',
        required: [true, 'Group is required']
    },
    invited_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        lowercase: true,
        trim: true
    },
    invite_code: {
        type: String,
        unique: true,
        required: true
    },
    invite_link: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined', 'expired'],
        default: 'pending'
    },
    expires_at: {
        type: Date,
        required: true
    },
    accepted_at: {
        type: Date,
        default: null
    },
    accepted_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    declined_at: {
        type: Date,
        default: null
    },
    message: {
        type: String,
        maxlength: [200, 'Message cannot exceed 200 characters']
    },
    role: {
        type: String,
        enum: ['admin', 'member'],
        default: 'member'
    }
}, {
    timestamps: true
});

// Indexes
groupInviteSchema.index({ group: 1, email: 1 });
groupInviteSchema.index({ invite_code: 1 });
groupInviteSchema.index({ status: 1 });
groupInviteSchema.index({ expires_at: 1 });

// Virtual for is expired
groupInviteSchema.virtual('is_expired').get(function() {
    return this.expires_at < new Date();
});

// Instance methods

/**
 * Generate invite code
 */
groupInviteSchema.methods.generateInviteCode = function() {
    const randomBytes = crypto.randomBytes(16).toString('hex');
    this.invite_code = `INV-${Date.now()}-${randomBytes}`;
    return this.invite_code;
};

/**
 * Generate invite link
 */
groupInviteSchema.methods.generateInviteLink = function() {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    this.invite_link = `${baseUrl}/groups/invite/${this.invite_code}`;
    return this.invite_link;
};

/**
 * Accept invite
 */
groupInviteSchema.methods.accept = async function(userId) {
    if (this.status !== 'pending') {
        throw new Error('Invite is no longer pending');
    }
    
    if (this.is_expired) {
        this.status = 'expired';
        await this.save();
        throw new Error('Invite has expired');
    }
    
    this.status = 'accepted';
    this.accepted_at = new Date();
    this.accepted_by = userId;
    
    await this.save();
    
    // Add user to group
    const SplitGroup = require('./SplitGroup');
    const group = await SplitGroup.findById(this.group);
    
    if (!group) {
        throw new Error('Group not found');
    }
    
    const User = require('./User');
    const user = await User.findById(userId);
    
    await group.addMember({
        userId: userId,
        email: this.email,
        nickname: user.name
    }, this.role);
    
    return this;
};

/**
 * Decline invite
 */
groupInviteSchema.methods.decline = async function() {
    if (this.status !== 'pending') {
        throw new Error('Invite is no longer pending');
    }
    
    this.status = 'declined';
    this.declined_at = new Date();
    
    await this.save();
    return this;
};

/**
 * Check if expired and update status
 */
groupInviteSchema.methods.checkExpiration = async function() {
    if (this.status === 'pending' && this.is_expired) {
        this.status = 'expired';
        await this.save();
        return true;
    }
    return false;
};

// Static methods

/**
 * Get pending invites for email
 */
groupInviteSchema.statics.getPendingInvites = async function(email) {
    const now = new Date();
    
    return await this.find({
        email: email.toLowerCase(),
        status: 'pending',
        expires_at: { $gt: now }
    })
        .populate('group', 'name description avatar')
        .populate('invited_by', 'name email')
        .sort({ createdAt: -1 });
};

/**
 * Get group invites
 */
groupInviteSchema.statics.getGroupInvites = async function(groupId, status = null) {
    const query = { group: groupId };
    
    if (status) {
        query.status = status;
    }
    
    return await this.find(query)
        .populate('invited_by', 'name email')
        .populate('accepted_by', 'name email')
        .sort({ createdAt: -1 });
};

/**
 * Find by invite code
 */
groupInviteSchema.statics.findByCode = async function(code) {
    const invite = await this.findOne({ invite_code: code })
        .populate('group', 'name description avatar currency members')
        .populate('invited_by', 'name email');
    
    if (!invite) {
        return null;
    }
    
    // Check if expired
    await invite.checkExpiration();
    
    return invite;
};

/**
 * Clean up expired invites
 */
groupInviteSchema.statics.cleanupExpired = async function() {
    const now = new Date();
    
    const result = await this.updateMany(
        {
            status: 'pending',
            expires_at: { $lt: now }
        },
        {
            status: 'expired'
        }
    );
    
    return result.modifiedCount;
};

/**
 * Revoke all pending invites for email in group
 */
groupInviteSchema.statics.revokeInvites = async function(groupId, email) {
    return await this.updateMany(
        {
            group: groupId,
            email: email.toLowerCase(),
            status: 'pending'
        },
        {
            status: 'expired'
        }
    );
};

// Pre-save middleware
groupInviteSchema.pre('save', function(next) {
    // Generate invite code if not set
    if (this.isNew && !this.invite_code) {
        this.generateInviteCode();
        this.generateInviteLink();
    }
    
    // Set default expiration (7 days)
    if (this.isNew && !this.expires_at) {
        this.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
    
    next();
});

// Enable virtuals in JSON
groupInviteSchema.set('toJSON', { virtuals: true });
groupInviteSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('GroupInvite', groupInviteSchema);
