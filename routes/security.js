const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const RiskProfile = require('../models/RiskProfile');
const Transaction = require('../models/Transaction');
const anomalyService = require('../services/anomalyService');

/**
 * @route   GET /api/security/risk-profile
 * @desc    Get the current user's risk profile and baselines
 */
router.get('/risk-profile', auth, async (req, res) => {
  try {
    let profile = await RiskProfile.findOne({ user: req.user._id })
      .populate('historicalFlags.transaction');

    if (!profile) {
      profile = await anomalyService.updateUserBaselines(req.user._id);
    }

    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/security/anomalies
 * @desc    Get all transactions flagged as anomalies
 */
router.get('/anomalies', auth, async (req, res) => {
  try {
    const anomalies = await Transaction.find({
      user: req.user._id,
      isAnomaly: true
    }).sort({ createdAt: -1 });

    res.json({ success: true, count: anomalies.length, data: anomalies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/security/recalculate-baselines
 * @desc    Force a recalculation of spending baselines
 */
router.post('/recalculate-baselines', auth, async (req, res) => {
  try {
    const profile = await anomalyService.updateUserBaselines(req.user._id);
    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;