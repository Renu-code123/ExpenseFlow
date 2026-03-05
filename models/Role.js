const mongoose = require('mongoose');

/**
 * Role Model
 * Issue #658: Role definitions with inherited permissions
 */
const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true // e.g., 'WORKSPACE_OWNER', 'VIEWER'
    },
    permissions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permission'
    }],
    isSystemRole: {
        type: Boolean,
        default: false
    },
    level: {
        type: Number,
        default: 0 // 0: User, 1: Manager, 2: Admin
    },
    inheritedFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Role', roleSchema);
