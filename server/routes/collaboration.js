const express = require('express');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const collaborationService = require('../services/collaborationService');
const auth = require('../middleware/auth');
const router = express.Router();

// Submit expense for approval
router.post('/approve', auth, async (req, res) => {
  try {
    const { expenseId, workspaceId } = req.body;
    const workflow = await collaborationService.submitForApproval(expenseId, workspaceId, req.user._id);
    res.status(201).json(workflow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve/reject expense
router.put('/approve/:id', auth, async (req, res) => {
  try {
    const { action, comment } = req.body;
    const workflow = await collaborationService.approveExpense(req.params.id, req.user._id, comment);
    res.json(workflow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pending approvals
router.get('/pending', auth, async (req, res) => {
  try {
    const workflows = await ApprovalWorkflow.find({ 
      'approvers.user': req.user._id,
      status: 'pending'
    }).populate('expense submittedBy');
    res.json(workflows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;