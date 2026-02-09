const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    role: {
        type: String,
        enum: ['member', 'lead', 'manager'],
        default: 'member'
    },
    joinedAt: {
        type: Date,
        default: Date.now
    }
});

const teamSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    members: [teamMemberSchema],
    parentTeam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team'
    },
    department: {
        type: String,
        required: true
    },
    approvalLimit: {
        type: Number,
        default: 0,
        description: 'Max amount team lead/manager can approve without higher escalation'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Team', teamSchema);
