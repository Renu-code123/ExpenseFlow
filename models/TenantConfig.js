const mongoose = require('mongoose');

/**
 * TenantConfig Model
 * Issue #729: Stores workspace-specific isolation policies and constraints.
 */
const tenantConfigSchema = new mongoose.Schema({
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        unique: true,
        index: true
    },
    isolationLevel: {
        type: String,
        enum: ['standard', 'strict', 'government'],
        default: 'standard'
    },
    allowedDomains: [{
        type: String
    }],
    dataRetentionDays: {
        type: Number,
        default: 3650 // 10 years by default
    },
    // Issue #757: Tenant-level Policy Reference
    policyNode: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PolicyNode'
    },
    ipWhitelist: [{
        type: String
    }],
    securityPolicy: {
        requireMFA: { type: Boolean, default: false },
        sessionTimeoutMinutes: { type: Number, default: 60 },
        preventCrossWorkspaceCopy: { type: Boolean, default: true }
    },
    billingModel: {
        plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
        tier: Number
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('TenantConfig', tenantConfigSchema);
