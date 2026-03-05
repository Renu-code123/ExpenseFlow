const mongoose = require('mongoose');

/**
 * Master Key Model
 * Issue #921: Secure storage of AES-256 master keys with lifecycle management
 */
const masterKeySchema = new mongoose.Schema({
    keyId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    version: {
        type: Number,
        required: true,
        default: 1
    },
    algorithm: {
        type: String,
        required: true,
        default: 'aes-256-gcm',
        enum: ['aes-256-gcm', 'aes-256-cbc', 'chacha20-poly1305']
    },
    // Encrypted master key material - never stored in plaintext
    encryptedKeyMaterial: {
        type: String,
        required: true
    },
    // Key wrapping information for secure storage
    keyWrapper: {
        algorithm: {
            type: String,
            required: true,
            enum: ['aes-256-gcm', 'rsa-oaep', 'ecdh']
        },
        wrappedKey: {
            type: String,
            required: true
        },
        wrappingKeyId: {
            type: String,
            required: true
        },
        iv: String,
        authTag: String
    },
    status: {
        type: String,
        enum: ['active', 'rotating', 'deprecated', 'revoked'],
        default: 'active',
        required: true
    },
    purpose: {
        type: String,
        required: true,
        enum: ['encryption', 'signing', 'key-wrapping', 'hsm-root']
    },
    storageBackend: {
        type: String,
        required: true,
        enum: ['vault', 'hsm', 'kms', 'local-encrypted', 'memory']
    },
    accessPolicy: {
        allowedRoles: [{
            type: String
        }],
        allowedServiceAccounts: [{
            type: String
        }],
        allowedOperations: [{
            type: String,
            enum: ['generate', 'retrieve', 'rotate', 'revoke', 'wrap', 'unwrap']
        }],
        requireMFA: {
            type: Boolean,
            default: true
        },
        maxAccessFrequency: {
            type: Number, // accesses per hour
            default: 100
        }
    },
    metadata: {
        createdBy: String,
        createdAt: {
            type: Date,
            default: Date.now,
            immutable: true
        },
        lastRotated: Date,
        rotationCount: {
            type: Number,
            default: 0
        },
        lastAccessed: Date,
        accessCount: {
            type: Number,
            default: 0
        },
        expiresAt: Date,
        rotationSchedule: {
            intervalDays: {
                type: Number,
                default: 90
            },
            nextRotation: Date
        },
        entropySource: {
            type: String,
            default: 'crypto.randomBytes'
        },
        securityLevel: {
            type: String,
            enum: ['standard', 'high', 'critical'],
            default: 'high'
        }
    },
    compliance: {
        fips140: {
            type: Boolean,
            default: true
        },
        pciDss: {
            type: Boolean,
            default: true
        },
        gdpr: {
            type: Boolean,
            default: true
        },
        hipaa: {
            type: Boolean,
            default: false
        }
    },
    auditTrail: [{
        timestamp: {
            type: Date,
            default: Date.now
        },
        action: {
            type: String,
            enum: ['created', 'accessed', 'rotated', 'revoked', 'wrapped', 'unwrapped']
        },
        actor: {
            userId: String,
            serviceAccount: String,
            ipAddress: String
        },
        details: mongoose.Schema.Types.Mixed
    }]
}, {
    timestamps: true
});

// Indexes for efficient queries
masterKeySchema.index({ status: 1, purpose: 1 });
masterKeySchema.index({ 'metadata.expiresAt': 1 }, { expireAfterSeconds: 0 });
masterKeySchema.index({ 'metadata.lastAccessed': -1 });
masterKeySchema.index({ storageBackend: 1, status: 1 });

// Pre-save middleware for validation
masterKeySchema.pre('save', function(next) {
    // Ensure encrypted key material is never logged
    if (this.isModified('encryptedKeyMaterial')) {
        // Validate that it's properly encrypted (basic check)
        if (!this.encryptedKeyMaterial || this.encryptedKeyMaterial.length < 64) {
            return next(new Error('Invalid encrypted key material'));
        }
    }

    // Set next rotation if not set
    if (this.status === 'active' && !this.metadata.nextRotation) {
        const nextRotation = new Date();
        nextRotation.setDate(nextRotation.getDate() + (this.metadata.rotationSchedule?.intervalDays || 90));
        this.metadata.nextRotation = nextRotation;
    }

    next();
});

// Instance method to check if rotation is needed
masterKeySchema.methods.needsRotation = function() {
    if (this.status !== 'active') return false;

    const now = new Date();
    const nextRotation = this.metadata.nextRotation || new Date(0);
    const expiresAt = this.metadata.expiresAt;

    return now >= nextRotation || (expiresAt && now >= expiresAt);
};

// Instance method to record access
masterKeySchema.methods.recordAccess = function(actor = {}) {
    this.metadata.lastAccessed = new Date();
    this.metadata.accessCount += 1;

    this.auditTrail.push({
        action: 'accessed',
        actor: {
            userId: actor.userId,
            serviceAccount: actor.serviceAccount,
            ipAddress: actor.ipAddress
        }
    });

    return this.save();
};

// Static method to find active master key by purpose
masterKeySchema.statics.findActiveByPurpose = function(purpose) {
    return this.findOne({
        purpose,
        status: 'active',
        $or: [
            { 'metadata.expiresAt': { $gt: new Date() } },
            { 'metadata.expiresAt': null }
        ]
    }).sort({ version: -1 });
};

module.exports = mongoose.model('MasterKey', masterKeySchema);