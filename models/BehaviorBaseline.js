const mongoose = require('mongoose');

const behaviorBaselineSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  lastSeen: { type: Date, default: Date.now },
  samples: { type: Number, default: 0 },
  avgIntervalMs: { type: Number, default: 0 },
  endpoints: { type: mongoose.Schema.Types.Mixed, default: {} },
  privilegeSeq: { type: [String], default: [] },
  lastDeviceFingerprint: { type: String },
  hourDistribution: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

behaviorBaselineSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('BehaviorBaseline', behaviorBaselineSchema);
