const mongoose = require('mongoose');

const deviceFingerprintSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fingerprint: { type: String, required: true, unique: true },
  deviceInfo: {
    userAgent: String,
    screen: { width: Number, height: Number },
    timezone: String,
    language: String,
    platform: String,
    cookieEnabled: Boolean,
    doNotTrack: Boolean
  },
  biometricData: {
    keystrokeDynamics: [Number],
    mouseBehavior: [Number],
    touchPatterns: [Number]
  },
  networkInfo: {
    ipAddress: String,
    isp: String,
    location: { country: String, city: String, lat: Number, lng: Number }
  },
  trustScore: { type: Number, min: 0, max: 1, default: 0.5 },
  status: { type: String, enum: ['trusted', 'suspicious', 'blocked'], default: 'trusted' },
  lastSeen: { type: Date, default: Date.now },
  loginCount: { type: Number, default: 1 }
}, { timestamps: true });

module.exports = mongoose.model('DeviceFingerprint', deviceFingerprintSchema);