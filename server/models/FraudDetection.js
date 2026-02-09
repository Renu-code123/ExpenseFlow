const mongoose = require('mongoose');

const fraudDetectionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
  riskScore: { type: Number, min: 0, max: 1, required: true },
  riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  detectionType: { type: String, enum: ['behavioral', 'amount', 'location', 'device', 'pattern'], required: true },
  riskFactors: [{
    factor: String,
    weight: Number,
    description: String
  }],
  mlPrediction: {
    model: String,
    confidence: Number,
    features: [Number]
  },
  behavioralAnalysis: {
    deviationScore: Number,
    normalPattern: Object,
    currentPattern: Object
  },
  deviceInfo: {
    fingerprint: String,
    ipAddress: String,
    userAgent: String,
    location: { lat: Number, lng: Number }
  },
  action: { type: String, enum: ['allow', 'flag', 'block', 'review'], default: 'allow' },
  reviewed: { type: Boolean, default: false },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('FraudDetection', fraudDetectionSchema);