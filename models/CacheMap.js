const mongoose = require('mongoose');

/**
 * CacheMap Model
 * Issue #781: Tracking dependencies between financial entity nodes
 */
const cacheMapSchema = new mongoose.Schema({
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', index: true },
    cacheKey: { type: String, required: true, index: true },
    dependentEntities: [{ type: String }], // e.g. 'EXPENSE:id', 'WORKSPACE:id'
    epochSequence: { type: Number, required: true },
    expiresAt: { type: Date, required: true }
}, {
    timestamps: true
});

// Index for expiry pruning
cacheMapSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('CacheMap', cacheMapSchema);
