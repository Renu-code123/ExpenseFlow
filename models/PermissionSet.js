const mongoose = require('mongoose');

/**
 * Granular Permission Set Model
 * Part of Issue #629: Consolidated Multi-Entity Workspace Integration
 * Allows for fine-grained access control across hierarchical workspaces
 */

const permissionSetSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: String,

    // Scoped permissions
    permissions: [{
        resource: {
            type: String, // 'transaction', 'report', 'budget', 'workspace', 'rule'
            required: true
        },
        action: {
            type: String, // 'create', 'read', 'update', 'delete', 'approve', 'execute'
            required: true
        },
        conditions: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {} // e.g., { "amount": { "$lt": 1000 } }
        },
        isInheritable: {
            type: Boolean,
            default: true // Whether this permission applies to sub-entities
        }
    }],

    // Role metadata
    isTemplate: {
        type: Boolean,
        default: false
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexes
permissionSetSchema.index({ name: 1 });

module.exports = mongoose.model('PermissionSet', permissionSetSchema);
