const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ValidationLog = require('../models/ValidationLog');
const PolicyNode = require('../models/PolicyNode');
const MultiSigWallet = require('../models/MultiSigWallet');
const policyResolver = require('../services/policyResolver');
const multiSigOrchestrator = require('../services/multiSigOrchestrator');
const approvalQuorum = require('../middleware/approvalQuorum');

/**
 * Data Governance Routes
 * Issue #704: API for monitoring data purity and remediation efficacy.
 */

/**
 * @route   GET /api/governance/purity-report
 * @desc    Get aggregate data quality metrics
 */
router.get('/purity-report', auth, async (req, res) => {
    try {
        const stats = await ValidationLog.aggregate([
            { $match: { userId: req.user._id } },
            {
                $group: {
                    _id: null,
                    avgPurityScore: { $avg: '$purityScore' },
                    totalRemediations: { $sum: { $size: '$remediationsApplied' } },
                    failedRecords: { $sum: { $cond: [{ $lt: ['$purityScore', 40] }, 1, 0] } },
                    totalChecks: { $sum: 1 }
                }
            }
        ]);

        res.json({ success: true, data: stats[0] || { avgPurityScore: 100, totalChecks: 0 } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/governance/remediations
 * @desc    Get recent remediation logs
 */
router.get('/remediations', auth, async (req, res) => {
    try {
        const logs = await ValidationLog.find({
            userId: req.user._id,
            'remediationsApplied.0': { $exists: true }
        })
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({ success: true, data: logs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/governance/effective-policy/:workspaceId
 * @desc    Get the fully resolved hierarchical policy for a workspace
 */
router.get('/effective-policy/:workspaceId', auth, async (req, res) => {
    try {
        const policy = await policyResolver.resolveEffectivePolicy(req.params.workspaceId, req.headers['x-tenant-id']);
        res.json({ success: true, data: policy });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   POST /api/governance/policies
 * @desc    Create or update a policy node for Circuit Breakers
 */
router.post('/policies', auth, async (req, res) => {
    try {
        const { workspaceId, name, conditions, action, targetResource, priority, isInheritable } = req.body;

        let node;
        if (workspaceId) {
            node = await PolicyNode.findOneAndUpdate(
                { workspaceId, name },
                { description: req.body.description, conditions, action, targetResource, priority, isInheritable },
                { upsert: true, new: true }
            );
        } else {
            node = await PolicyNode.findOneAndUpdate(
                { level: req.body.level, targetId: req.body.targetId },
                req.body,
                { upsert: true, new: true }
            );
        }

        res.json({ success: true, data: node });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Issue #797: Multi-Signature Consensus Routes
 */

/**
 * @route   POST /api/governance/quorum/wallets
 * @desc    Create a new multi-sig wallet for a workspace
 */
router.post('/quorum/wallets', auth, async (req, res) => {
    try {
        const { workspaceId, walletName, description, defaultQuorum, thresholdRules, authorizedSigners } = req.body;

        const wallet = await MultiSigWallet.create({
            workspaceId,
            walletName,
            description,
            defaultQuorum: defaultQuorum || { m: 2, n: 3, mode: 'FIXED' },
            thresholdRules: thresholdRules || [],
            authorizedSigners: authorizedSigners || [],
            inheritFromWorkspace: true
        });

        res.status(201).json({ success: true, data: wallet });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/governance/quorum/wallets/:workspaceId
 * @desc    Get multi-sig wallets for a workspace
 */
router.get('/quorum/wallets/:workspaceId', auth, async (req, res) => {
    try {
        const wallets = await MultiSigWallet.find({
            workspaceId: req.params.workspaceId,
            isActive: true
        });
        res.json({ success: true, data: wallets });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   POST /api/governance/quorum/signers
 * @desc    Add authorized signer to a wallet
 */
router.post('/quorum/signers', auth, async (req, res) => {
    try {
        const { walletId, userId, role, weight, requiredProofTypes } = req.body;

        const wallet = await MultiSigWallet.findById(walletId);
        if (!wallet) {
            return res.status(404).json({ success: false, error: 'Wallet not found' });
        }

        wallet.authorizedSigners.push({
            userId,
            role: role || 'SIGNER',
            weight: weight || 1,
            canInitiate: role !== 'AUDITOR',
            canApprove: role !== 'AUDITOR',
            canReject: role === 'OWNER' || role === 'ADMIN',
            addedBy: req.user._id,
            requiredProofTypes: requiredProofTypes || ['PASSWORD']
        });

        await wallet.save();
        res.json({ success: true, data: wallet });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/governance/quorum/pending
 * @desc    Get pending operations for current user
 */
router.get('/quorum/pending', auth, async (req, res) => {
    try {
        const pending = await multiSigOrchestrator.getPendingForUser(req.user._id);
        res.json({ success: true, data: pending });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   POST /api/governance/quorum/sign
 * @desc    Submit signature for a pending operation
 */
router.post('/quorum/sign', auth, approvalQuorum.handleSignatureSubmission);

/**
 * @route   POST /api/governance/quorum/reject
 * @desc    Reject a pending operation
 */
router.post('/quorum/reject', auth, async (req, res) => {
    try {
        const { operationId, reason } = req.body;
        const result = await multiSigOrchestrator.rejectOperation(operationId, req.user._id, reason);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/governance/quorum/operation/:operationId
 * @desc    Get operation status and details
 */
router.get('/quorum/operation/:operationId', auth, async (req, res) => {
    try {
        const wallet = await MultiSigWallet.findOne({
            'pendingOperations.operationId': req.params.operationId
        });

        if (!wallet) {
            return res.status(404).json({ success: false, error: 'Operation not found' });
        }

        const summary = wallet.getOperationSummary(req.params.operationId);
        res.json({ success: true, data: summary });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   PUT /api/governance/quorum/thresholds/:walletId
 * @desc    Update threshold rules for a wallet
 */
router.put('/quorum/thresholds/:walletId', auth, async (req, res) => {
    try {
        const { thresholdRules } = req.body;

        const wallet = await MultiSigWallet.findByIdAndUpdate(
            req.params.walletId,
            { thresholdRules },
            { new: true }
        );

        if (!wallet) {
            return res.status(404).json({ success: false, error: 'Wallet not found' });
        }

        res.json({ success: true, data: wallet });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
