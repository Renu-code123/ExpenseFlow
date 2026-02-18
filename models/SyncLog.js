const mongoose = require('mongoose');

/**
 * SyncLog Model
 * Issue #660: Tracks every mutation for differential synchronization across devices
 */
const syncLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  entityType: {
    type: String,
    enum: ['Transaction', 'Category', 'Budget', 'Workspace'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  operation: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE'],
    required: true
  },
  changes: {
    type: mongoose.Schema.Types.Mixed // Stores only the diff for updates
  },
  version: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  appliedToDevices: [{
    deviceId: String,
    appliedAt: Date
  }]
}, {
  timestamps: true
});

// Compound index for efficient fetching of changes since a specific version
syncLogSchema.index({ userId: 1, entityType: 1, version: 1 });
syncLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // TTL: 30 days

module.exports = mongoose.model('SyncLog', syncLogSchema);
