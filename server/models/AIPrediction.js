const mongoose = require('mongoose');

const aiPredictionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['category_prediction', 'cash_flow_forecast', 'anomaly_detection', 'spending_pattern'],
    required: true
  },
  inputData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  prediction: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    required: true
  },
  accuracy: {
    type: Number,
    min: 0,
    max: 1
  },
  modelVersion: {
    type: String,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  actualOutcome: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

aiPredictionSchema.index({ userId: 1, type: 1 });
aiPredictionSchema.index({ createdAt: -1 });
aiPredictionSchema.index({ confidence: -1 });

module.exports = mongoose.model('AIPrediction', aiPredictionSchema);