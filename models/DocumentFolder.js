const mongoose = require('mongoose');

const documentFolderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User is required'],
        index: true
    },
    name: {
        type: String,
        required: [true, 'Folder name is required'],
        trim: true,
        maxlength: [100, 'Folder name cannot exceed 100 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    color: {
        type: String,
        default: '#3498db',
        match: [/^#[0-9A-F]{6}$/i, 'Invalid color format']
    },
    icon: {
        type: String,
        default: 'folder'
    },
    parent_folder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DocumentFolder',
        default: null
    },
    path: {
        type: String,
        default: '/'
    },
    is_system: {
        type: Boolean,
        default: false
    },
    sort_order: {
        type: Number,
        default: 0
    },
    metadata: {
        document_count: {
            type: Number,
            default: 0
        },
        total_size: {
            type: Number,
            default: 0
        },
        last_updated: {
            type: Date,
            default: Date.now
        }
    }
}, {
    timestamps: true
});

// Indexes
documentFolderSchema.index({ user: 1, parent_folder: 1 });
documentFolderSchema.index({ user: 1, name: 1 });
documentFolderSchema.index({ path: 1 });

// Virtual for subfolder count
documentFolderSchema.virtual('subfolder_count', {
    ref: 'DocumentFolder',
    localField: '_id',
    foreignField: 'parent_folder',
    count: true
});

// Instance methods

/**
 * Get full path
 */
documentFolderSchema.methods.getFullPath = async function() {
    if (!this.parent_folder) {
        return `/${this.name}`;
    }
    
    const parent = await this.constructor.findById(this.parent_folder);
    if (!parent) {
        return `/${this.name}`;
    }
    
    const parentPath = await parent.getFullPath();
    return `${parentPath}/${this.name}`;
};

/**
 * Move folder
 */
documentFolderSchema.methods.moveTo = async function(newParentId) {
    // Prevent moving to self or descendant
    if (newParentId && newParentId.toString() === this._id.toString()) {
        throw new Error('Cannot move folder to itself');
    }
    
    if (newParentId) {
        const newParent = await this.constructor.findById(newParentId);
        
        if (!newParent) {
            throw new Error('Parent folder not found');
        }
        
        if (newParent.user.toString() !== this.user.toString()) {
            throw new Error('Cannot move to another user\'s folder');
        }
        
        // Check if new parent is a descendant
        const isDescendant = await this.isDescendantOf(newParentId);
        if (isDescendant) {
            throw new Error('Cannot move folder to its own descendant');
        }
    }
    
    this.parent_folder = newParentId;
    this.path = await this.getFullPath();
    await this.save();
    
    // Update paths of all descendants
    await this.updateDescendantPaths();
    
    return this;
};

/**
 * Check if folder is descendant of another
 */
documentFolderSchema.methods.isDescendantOf = async function(ancestorId) {
    if (!this.parent_folder) {
        return false;
    }
    
    if (this.parent_folder.toString() === ancestorId.toString()) {
        return true;
    }
    
    const parent = await this.constructor.findById(this.parent_folder);
    if (!parent) {
        return false;
    }
    
    return await parent.isDescendantOf(ancestorId);
};

/**
 * Update paths of all descendants
 */
documentFolderSchema.methods.updateDescendantPaths = async function() {
    const children = await this.constructor.find({
        parent_folder: this._id
    });
    
    for (const child of children) {
        child.path = await child.getFullPath();
        await child.save();
        await child.updateDescendantPaths();
    }
};

/**
 * Update metadata
 */
documentFolderSchema.methods.updateMetadata = async function() {
    const ReceiptDocument = require('./ReceiptDocument');
    
    const count = await ReceiptDocument.countDocuments({
        user: this.user,
        folder: this._id
    });
    
    const sizeResult = await ReceiptDocument.aggregate([
        {
            $match: {
                user: this.user,
                folder: this._id
            }
        },
        {
            $group: {
                _id: null,
                total_size: { $sum: '$original_image.size' }
            }
        }
    ]);
    
    this.metadata.document_count = count;
    this.metadata.total_size = sizeResult.length > 0 ? sizeResult[0].total_size : 0;
    this.metadata.last_updated = new Date();
    
    await this.save();
    
    return this;
};

/**
 * Get all documents in folder (including subfolders)
 */
documentFolderSchema.methods.getAllDocuments = async function(includeSubfolders = false) {
    const ReceiptDocument = require('./ReceiptDocument');
    
    if (!includeSubfolders) {
        return await ReceiptDocument.find({
            user: this.user,
            folder: this._id
        }).sort({ createdAt: -1 });
    }
    
    // Get all descendant folders
    const descendants = await this.getDescendants();
    const folderIds = [this._id, ...descendants.map(d => d._id)];
    
    return await ReceiptDocument.find({
        user: this.user,
        folder: { $in: folderIds }
    }).sort({ createdAt: -1 });
};

/**
 * Get all descendant folders
 */
documentFolderSchema.methods.getDescendants = async function() {
    const children = await this.constructor.find({
        parent_folder: this._id
    });
    
    let descendants = [...children];
    
    for (const child of children) {
        const childDescendants = await child.getDescendants();
        descendants = [...descendants, ...childDescendants];
    }
    
    return descendants;
};

// Static methods

/**
 * Get user's folders
 */
documentFolderSchema.statics.getUserFolders = async function(userId, parentId = null) {
    return await this.find({
        user: userId,
        parent_folder: parentId
    }).sort({ sort_order: 1, name: 1 });
};

/**
 * Get folder tree
 */
documentFolderSchema.statics.getFolderTree = async function(userId) {
    const allFolders = await this.find({ user: userId }).sort({ sort_order: 1, name: 1 });
    
    const buildTree = (parentId = null) => {
        return allFolders
            .filter(f => {
                if (parentId === null) {
                    return !f.parent_folder;
                }
                return f.parent_folder && f.parent_folder.toString() === parentId.toString();
            })
            .map(folder => ({
                ...folder.toObject(),
                children: buildTree(folder._id)
            }));
    };
    
    return buildTree();
};

/**
 * Create default folders
 */
documentFolderSchema.statics.createDefaultFolders = async function(userId) {
    const defaultFolders = [
        { name: 'Receipts', icon: 'receipt', color: '#3498db', is_system: true, sort_order: 1 },
        { name: 'Invoices', icon: 'file-invoice', color: '#2ecc71', is_system: true, sort_order: 2 },
        { name: 'Tax Documents', icon: 'file-alt', color: '#e74c3c', is_system: true, sort_order: 3 },
        { name: 'Bills', icon: 'file-invoice-dollar', color: '#f39c12', is_system: true, sort_order: 4 }
    ];
    
    const created = [];
    
    for (const folderData of defaultFolders) {
        const existing = await this.findOne({
            user: userId,
            name: folderData.name,
            is_system: true
        });
        
        if (!existing) {
            const folder = await this.create({
                user: userId,
                ...folderData,
                path: `/${folderData.name}`
            });
            created.push(folder);
        }
    }
    
    return created;
};

/**
 * Delete folder and move documents
 */
documentFolderSchema.statics.deleteFolder = async function(folderId, moveToFolderId = null) {
    const folder = await this.findById(folderId);
    
    if (!folder) {
        throw new Error('Folder not found');
    }
    
    if (folder.is_system) {
        throw new Error('Cannot delete system folder');
    }
    
    const ReceiptDocument = require('./ReceiptDocument');
    
    // Move documents to new folder or null
    await ReceiptDocument.updateMany(
        { folder: folderId },
        { folder: moveToFolderId }
    );
    
    // Move subfolders
    await this.updateMany(
        { parent_folder: folderId },
        { parent_folder: folder.parent_folder }
    );
    
    await folder.deleteOne();
    
    return true;
};

// Pre-save middleware
documentFolderSchema.pre('save', async function(next) {
    if (this.isNew || this.isModified('parent_folder') || this.isModified('name')) {
        this.path = await this.getFullPath();
    }
    next();
});

// Post-delete middleware
documentFolderSchema.post('deleteOne', { document: true, query: false }, async function() {
    // Update parent folder metadata
    if (this.parent_folder) {
        const parent = await this.constructor.findById(this.parent_folder);
        if (parent) {
            await parent.updateMetadata();
        }
    }
});

// Enable virtuals in JSON
documentFolderSchema.set('toJSON', { virtuals: true });
documentFolderSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('DocumentFolder', documentFolderSchema);
