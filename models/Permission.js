const mongoose = require('mongoose');

/**
 * Permission Model
 * Issue #658: Granular action definitions for the RBAC system
 */
const permissionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true // e.g., 'TRANSACTION_CREATE', 'WORKSPACE_ADMIN'
    },
    description: String,
    module: {
        type: String,
        required: true,
        enum: ['TRANSACTIONS', 'WORKSPACES', 'REPORTS', 'USERS', 'SETTINGS', 'AUDIT']
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Permission', permissionSchema);
