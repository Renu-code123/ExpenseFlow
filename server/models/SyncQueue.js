const mongoose = require('mongoose');

const syncQueueSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE'],
    required: true
  },
  resourceType: {
    type: String,
    enum: ['expense'],
    required: true
  },
  resourceId: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed
  },
  processed: {
    type: Boolean,
    default: false
  },
  deviceId: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SyncQueue', syncQueueSchema);