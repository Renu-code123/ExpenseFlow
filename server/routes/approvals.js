const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const approvalService = require('../services/approvalService');

/**
 * @route   POST /api/approvals/submit/:transactionId
 * @desc    Submit an expense for approval
 */
router.post('/submit/:transactionId', auth, async (req, res) => {
    try {
        const result = await approvalService.submitForApproval(req.params.transactionId, req.user._id);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/approvals/pending
 * @desc    Get pending approvals for current user (approver)
 */
router.get('/pending', auth, roleCheck(['approver', 'finance', 'admin']), async (req, res) => {
    try {
        const results = await approvalService.getPendingApprovals(req.user._id);
        res.json({ success: true, data: results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   POST /api/approvals/process/:transactionId
 * @desc    Approve or reject a transaction
 */
router.post('/process/:transactionId', auth, roleCheck(['approver', 'finance', 'admin']), async (req, res) => {
    try {
        const { action, comment } = req.body;
        let result;

        if (action === 'approve') {
            result = await approvalService.approveTransaction(req.params.transactionId, req.user._id, comment);
        } else if (action === 'reject') {
            result = await approvalService.rejectTransaction(req.params.transactionId, req.user._id, comment);
        } else {
            return res.status(400).json({ success: false, error: 'Invalid action' });
        }

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;