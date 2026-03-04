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

// ============================================
// RED-TEAM & THREAT SURFACE ROUTES (Issue #907)
// ============================================

/**
 * @route   GET /api/security/attack-graph
 * @desc    Get the current workspace's attack surface and vulnerabilities
 */
router.get('/attack-graph', auth, async (req, res) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] || (req.user ? req.user.activeWorkspace : null);
    const AttackGraph = require('../models/AttackGraph');
    const graph = await AttackGraph.findOne({ workspaceId });

    if (!graph) return res.status(404).json({ success: false, message: 'Attack graph not yet generated.' });

    res.json({ success: true, data: graph });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/security/incidents
 * @desc    Review detection failures and red-team findings
 */
router.get('/incidents', auth, async (req, res) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] || (req.user ? req.user.activeWorkspace : null);
    const incidentRepository = require('../repositories/incidentRepository');
    const incidents = await incidentRepository.getUnresolvedIncidents(workspaceId);

    res.json({ success: true, data: incidents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/security/simulate-attack
 * @desc    Manually trigger a red-team simulation run
 */
router.post('/simulate-attack', auth, async (req, res) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] || (req.user ? req.user.activeWorkspace : null);
    const adversarialSimulator = require('../services/adversarialSimulator');
    const attacks = await adversarialSimulator.generateAdversarialBatch(workspaceId);

    res.json({
      success: true,
      message: `Generated ${attacks.length} synthetic attack transactions for audit.`,
      attacks
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// QUANTUM READINESS & PQC ANCHORING (Issue #960)
// ============================================

/**
 * @route   GET /api/security/quantum-anchors
 * @desc    Get PQC anchor status for forensic shards
 */
router.get('/quantum-anchors', auth, async (req, res) => {
  try {
    const QuantumAnchor = require('../models/QuantumAnchor');
    const anchors = await QuantumAnchor.find({})
      .sort({ timestamp: -1 })
      .limit(50);

    res.json({ success: true, count: anchors.length, data: anchors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/security/quantum-readiness
 * @desc    Comprehensive check for quantum-resistant compliance
 */
router.get('/quantum-readiness', auth, async (req, res) => {
  try {
    const LedgerShard = require('../models/LedgerShard');
    const QuantumAnchor = require('../models/QuantumAnchor');

    const shardCount = await LedgerShard.countDocuments({});
    const anchorCount = await QuantumAnchor.countDocuments({});
    const recentlyAnchored = await LedgerShard.countDocuments({
      lastAnchoredAt: { $gt: new Date(Date.now() - 3600000) }
    });

    res.json({
      success: true,
      data: {
        shardProtectionRatio: shardCount > 0 ? (anchorCount / shardCount) : 1,
        healthStatus: recentlyAnchored > 0 ? 'OPTIMAL' : 'DEGRADED',
        lastGlobalSync: new Date(),
        algorithm: 'CRYSTALS-DILITHIUM (Level 3)'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
