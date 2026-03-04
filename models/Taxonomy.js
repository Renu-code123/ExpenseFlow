const mongoose = require('mongoose');

/**
 * Taxonomy Model
 * Issue #706: Dynamic hierarchical categorization system.
 * Replaces hardcoded category strings with a flexible tree structure.
 */
const taxonomySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 50
    },
    slug: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        index: true
    },
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Taxonomy',
        default: null,
        index: true
    },
    description: String,
    icon: {
        type: String,
        default: 'folder'
    },
    color: {
        type: String,
        default: '#808080'
    },
    type: {
        type: String,
        enum: ['income', 'expense', 'transfer', 'system'],
        default: 'expense',
        index: true
    },
    isSystem: {
        type: Boolean,
        default: false
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null, // null means global/system category
        index: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    level: {
        type: Number,
        default: 0
    },
    path: {
        type: String, // Materialized path: /root-slug/child-slug/
        index: true
    }
}, {
    timestamps: true
});

const auditPlugin = require('../plugins/mongooseAuditV2');

// Composite unique index for slug per user context
taxonomySchema.index({ slug: 1, user: 1 }, { unique: true });

// Register Audit Plugin
taxonomySchema.plugin(auditPlugin, { modelName: 'Taxonomy' });

// Pre-save hook to calculate level and path
taxonomySchema.pre('save', async function (next) {
    if (this.isModified('parent')) {
        if (!this.parent) {
            this.level = 0;
            this.path = `/${this.slug}/`;
        } else {
            const parent = await mongoose.model('Taxonomy').findById(this.parent);
            if (parent) {
                this.level = parent.level + 1;
                this.path = `${parent.path}${this.slug}/`;
            }
        }
    }
    next();
});

module.exports = mongoose.model('Taxonomy', taxonomySchema);
