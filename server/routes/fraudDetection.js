const express = require('express');
const FraudDetection = require('../models/FraudDetection');
const SecurityEvent = require('../models/SecurityEvent');
const DeviceFingerprint = require('../models/DeviceFingerprint');
const fraudDetectionService = require('../services/fraudDetectionService');
const auth = require('../middleware/auth');
const router = express.Router();

// Get fraud alerts for user
router.get('/alerts', auth, async (req, res) => {
  try {
    const alerts = await FraudDetection.find({ 
      user: req.user._id,
      riskLevel: { $in: ['high', 'critical'] }
    }).sort({ createdAt: -1 });
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get security events
router.get('/security-events', auth, async (req, res) => {
  try {
    const events = await SecurityEvent.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get trusted devices
router.get('/devices', auth, async (req, res) => {
  try {
    const devices = await DeviceFingerprint.find({ user: req.user._id })
      .sort({ lastSeen: -1 });
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trust/block device
router.put('/devices/:id/trust', auth, async (req, res) => {
  try {
    const { status, trustScore } = req.body;
    const device = await DeviceFingerprint.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { status, trustScore },
      { new: true }
    );
    res.json(device);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Review fraud alert
router.put('/alerts/:id/review', auth, async (req, res) => {
  try {
    const { action, notes } = req.body;
    const alert = await FraudDetection.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { 
        reviewed: true,
        reviewedBy: req.user._id,
        action
      },
      { new: true }
    );
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get fraud statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const stats = await FraudDetection.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: '$riskLevel',
          count: { $sum: 1 },
          avgRiskScore: { $avg: '$riskScore' }
        }
      }
    ]);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;