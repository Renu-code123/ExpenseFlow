const mongoose = require('mongoose');

const aiTrainingDataSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  modelType: {
    type: String,
    enum: ['category_classifier', 'fraud_detector', 'cash_flow_predictor', 'anomaly_detector'],
    required: true
  },
  features: [{
    name: String,
    value: mongoose.Schema.Types.Mixed,
    type: {
      type: String,
      enum: ['numeric', 'categorical', 'text', 'date']
    }
  }],
  label: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  isValidated: {
    type: Boolean,
    default: false
  },
  weight: {
    type: Number,
    default: 1.0
  }
}, {
  timestamps: true
});

aiTrainingDataSchema.index({ userId: 1, modelType: 1 });
aiTrainingDataSchema.index({ isValidated: 1 });

module.exports = mongoose.model('AITrainingData', aiTrainingDataSchema);