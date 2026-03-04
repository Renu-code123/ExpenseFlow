const express = require('express');
const auth = require('../middleware/auth');
const Reimbursement = require('../models/Reimbursement');
const reimbursementService = require('../services/reimbursementService');
const { 
  validateReimbursement, 
  validateReimbursementUpdate, 
  validateApproval, 
  validateRejection,
  validatePayment,
  validateBulkOperation,
  validateReportFilter
} = require('../middleware/reimbursementValidator');
const router = express.Router();

/**
 * @route   GET /api/reimbursements
 * @desc    Get all reimbursement claims for user
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const { 
      status, 
      category, 
      priority, 
      startDate, 
      endDate,
      sortBy = 'createdAt', 
      order = 'desc',
      page = 1,
      limit = 20
    } = req.query;
    
    let query = { user: req.user._id, isActive: true };
    
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (startDate || endDate) {
      query.expenseDate = {};
      if (startDate) query.expenseDate.$gte = new Date(startDate);
      if (endDate) query.expenseDate.$lte = new Date(endDate);
    }
    
    const sortOrder = order === 'asc' ? 1 : -1;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [claims, total] = await Promise.all([
      Reimbursement.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit)),
      Reimbursement.countDocuments(query)
    ]);
    
    res.json({ 
      success: true, 
      count: claims.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: claims 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/reimbursements/summary
 * @desc    Get reimbursement summary dashboard
 * @access  Private
 */
router.get('/summary', auth, async (req, res) => {
  try {
    const summary = await reimbursementService.getSummary(req.user._id);
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/reimbursements/attention
 * @desc    Get claims needing attention
 * @access  Private
 */
router.get('/attention', auth, async (req, res) => {
  try {
    const attentionNeeded = await reimbursementService.getClaimsNeedingAttention(req.user._id);
    res.json({ success: true, data: attentionNeeded });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/reimbursements/approval-queue
 * @desc    Get approval queue (for approvers)
 * @access  Private
 */
router.get('/approval-queue', auth, async (req, res) => {
  try {
    const { status = 'pending', limit = 20 } = req.query;
    const queue = await reimbursementService.getApprovalQueue(status, limit);
    res.json({ success: true, data: queue });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/reimbursements
 * @desc    Create a new reimbursement claim
 * @access  Private
 */
router.post('/', auth, validateReimbursement, async (req, res) => {
  try {
    const claim = await reimbursementService.createClaim(req.user._id, req.body);
    
    res.status(201).json({ 
      success: true, 
      message: 'Reimbursement claim created successfully',
      data: claim 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/reimbursements/:id
 * @desc    Get specific claim details
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const claim = await Reimbursement.findOne({ 
      _id: req.params.id, 
      user: req.user._id 
    }).populate('approvedBy rejectedBy', 'name email');
    
    if (!claim) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }
    
    res.json({ success: true, data: claim });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   PUT /api/reimbursements/:id
 * @desc    Update a claim
 * @access  Private
 */
router.put('/:id', auth, validateReimbursementUpdate, async (req, res) => {
  try {
    const claim = await reimbursementService.updateClaim(
      req.params.id, 
      req.user._id, 
      req.body
    );
    
    res.json({ 
      success: true, 
      message: 'Claim updated successfully',
      data: claim 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/reimbursements/:id/submit
 * @desc    Submit a draft claim for approval
 * @access  Private
 */
router.post('/:id/submit', auth, async (req, res) => {
  try {
    const claim = await reimbursementService.submitClaim(req.params.id, req.user._id);
    
    res.json({ 
      success: true, 
      message: 'Claim submitted for approval',
      data: claim 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/reimbursements/:id/approve
 * @desc    Approve a claim
 * @access  Private
 */
router.post('/:id/approve', auth, validateApproval, async (req, res) => {
  try {
    const claim = await reimbursementService.approveClaim(
      req.params.id, 
      req.user._id,
      req.body.notes
    );
    
    res.json({ 
      success: true, 
      message: 'Claim approved successfully',
      data: claim 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/reimbursements/:id/reject
 * @desc    Reject a claim
 * @access  Private
 */
router.post('/:id/reject', auth, validateRejection, async (req, res) => {
  try {
    const claim = await reimbursementService.rejectClaim(
      req.params.id, 
      req.user._id,
      req.body.reason
    );
    
    res.json({ 
      success: true, 
      message: 'Claim rejected',
      data: claim 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/reimbursements/:id/review
 * @desc    Put claim under review
 * @access  Private
 */
router.post('/:id/review', auth, async (req, res) => {
  try {
    const claim = await reimbursementService.reviewClaim(
      req.params.id, 
      req.user._id,
      req.body.notes
    );
    
    res.json({ 
      success: true, 
      message: 'Claim is now under review',
      data: claim 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/reimbursements/:id/pay
 * @desc    Process payment for approved claim
 * @access  Private
 */
router.post('/:id/pay', auth, validatePayment, async (req, res) => {
  try {
    const paymentData = {
      ...req.body,
      paidBy: req.user._id
    };
    
    const claim = await reimbursementService.processPayment(req.params.id, paymentData);
    
    res.json({ 
      success: true, 
      message: 'Payment processed successfully',
      data: claim 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/reimbursements/:id/cancel
 * @desc    Cancel a claim
 * @access  Private
 */
router.post('/:id/cancel', auth, async (req, res) => {
  try {
    const claim = await reimbursementService.cancelClaim(
      req.params.id, 
      req.user._id,
      req.body.reason
    );
    
    res.json({ 
      success: true, 
      message: 'Claim cancelled successfully',
      data: claim 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   DELETE /api/reimbursements/:id
 * @desc    Delete a claim (soft delete)
 * @access  Private
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const claim = await Reimbursement.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isActive: false },
      { new: true }
    );
    
    if (!claim) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Claim deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/reimbursements/bulk/approve
 * @desc    Bulk approve claims
 * @access  Private
 */
router.post('/bulk/approve', auth, validateBulkOperation, async (req, res) => {
  try {
    const { claimIds, notes } = req.body;
    const results = await reimbursementService.bulkApprove(
      claimIds, 
      req.user._id,
      notes
    );
    
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    
    res.json({ 
      success: true, 
      message: `Bulk approval completed: ${successful} successful, ${failed} failed`,
      data: results 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/reimbursements/bulk/pay
 * @desc    Bulk process payments
 * @access  Private
 */
router.post('/bulk/pay', auth, validateBulkOperation, async (req, res) => {
  try {
    const { claimIds, ...paymentData } = req.body;
    paymentData.paidBy = req.user._id;
    
    const results = await reimbursementService.bulkProcessPayments(claimIds, paymentData);
    
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    
    res.json({ 
      success: true, 
      message: `Bulk payment completed: ${successful} successful, ${failed} failed`,
      data: results 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/reimbursements/report
 * @desc    Generate reimbursement report
 * @access  Private
 */
router.post('/report', auth, validateReportFilter, async (req, res) => {
  try {
    const report = await reimbursementService.generateReport(req.user._id, req.body);
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/reimbursements/statistics/range
 * @desc    Get claim statistics for date range
 * @access  Private
 */
router.get('/statistics/range', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Start date and end date are required' 
      });
    }
    
    const stats = await reimbursementService.getStatistics(
      req.user._id, 
      startDate, 
      endDate
    );
    
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
