const mongoose = require('mongoose');

const behaviorAnomalyLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  score: { type: Number, required: true },
  confidence: { type: Number, default: 0 },
  features: { type: mongoose.Schema.Types.Mixed, default: {} },
  explain: { type: mongoose.Schema.Types.Mixed, default: {} },
  requestContext: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

behaviorAnomalyLogSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('BehaviorAnomalyLog', behaviorAnomalyLogSchema);
