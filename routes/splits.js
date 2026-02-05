const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const splitService = require('../services/splitService');
const settlementService = require('../services/settlementService');
const Joi = require('joi');

// Validation schemas
const createSplitSchema = Joi.object({
  expenseId: Joi.string().required(),
  groupId: Joi.string().required(),
  splitMethod: Joi.string().valid('equal', 'custom').required(),
  participants: Joi.array().items(
    Joi.object({
      user: Joi.string().required(),
      amount: Joi.number().min(0),
      percentage: Joi.number().min(0).max(100)
    })
  ).when('splitMethod', {
    is: 'custom',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  notes: Joi.string().trim().max(500).optional()
});

const settlementSchema = Joi.object({
  method: Joi.string().valid('cash', 'bank_transfer', 'upi', 'paypal', 'venmo', 'other').required(),
  reference: Joi.string().trim().max(200).optional()
});

/**
 * @route   POST /api/splits
 * @desc    Create a new expense split
 * @access  Private
 */
router.post('/', auth, async (req, res) => {
  try {
    const { error, value } = createSplitSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const split = await splitService.createSplit(
      value.expenseId,
      value.groupId,
      req.user._id,
      value
    );

    res.status(201).json({
      success: true,
      message: 'Expense split created successfully',
      data: split
    });
  } catch (error) {
    console.error('[Splits Routes] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/splits
 * @desc    Get user's pending splits
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const splits = await splitService.getUserPendingSplits(req.user._id);

    res.json({
      success: true,
      count: splits.length,
      data: splits
    });
  } catch (error) {
    console.error('[Splits Routes] Get pending error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/splits/:id
 * @desc    Get split by ID
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const split = await splitService.getSplitById(req.params.id, req.user._id);

    res.json({
      success: true,
      data: split
    });
  } catch (error) {
    console.error('[Splits Routes] Get by ID error:', error);
    if (error.message === 'Split not found' || error.message === 'Access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/splits/expense/:expenseId
 * @desc    Get splits for an expense
 * @access  Private
 */
router.get('/expense/:expenseId', auth, async (req, res) => {
  try {
    const splits = await splitService.getSplitsForExpense(req.params.expenseId, req.user._id);

    res.json({
      success: true,
      count: splits.length,
      data: splits
    });
  } catch (error) {
    console.error('[Splits Routes] Get for expense error:', error);
    if (error.message.includes('not found') || error.message === 'Access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   PATCH /api/splits/:id/pay
 * @desc    Mark user as paid for a split
 * @access  Private
 */
router.patch('/:id/pay', auth, async (req, res) => {
  try {
    const split = await splitService.markAsPaid(req.params.id, req.user._id);

    res.json({
      success: true,
      message: 'Payment marked successfully',
      data: split
    });
  } catch (error) {
    console.error('[Splits Routes] Mark as paid error:', error);
    if (error.message.includes('not found') || error.message === 'Access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/splits/:id/remind/:participantId
 * @desc    Send payment reminder to a participant
 * @access  Private
 */
router.post('/:id/remind/:participantId', auth, async (req, res) => {
  try {
    const split = await splitService.sendReminder(
      req.params.id,
      req.user._id,
      req.params.participantId
    );

    res.json({
      success: true,
      message: 'Reminder sent successfully'
    });
  } catch (error) {
    console.error('[Splits Routes] Send reminder error:', error);
    if (error.message.includes('not found') || error.message === 'Access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/splits/statistics/user
 * @desc    Get user's split statistics
 * @access  Private
 */
router.get('/statistics/user', auth, async (req, res) => {
  try {
    const statistics = await splitService.getUserSplitStatistics(req.user._id);

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('[Splits Routes] Get statistics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// SETTLEMENT & DEBT SIMPLIFICATION ROUTES
// ==========================================

/**
 * @route   GET /api/splits/settlements/simplify/:groupId
 * @desc    Get simplified debts for a group (debt minimization algorithm)
 * @access  Private
 */
router.get('/settlements/simplify/:groupId', auth, async (req, res) => {
  try {
    const result = await settlementService.simplifyDebts(req.params.groupId);
    
    res.json({
      success: true,
      message: `Debts simplified: ${result.original.count} → ${result.simplified.count} transactions`,
      data: result
    });
  } catch (error) {
    console.error('[Settlements] Simplify debts error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/splits/settlements/center/:groupId
 * @desc    Get settlement center data (simplified debts, balances, pending settlements)
 * @access  Private
 */
router.get('/settlements/center/:groupId', auth, async (req, res) => {
  try {
    const data = await settlementService.getSettlementCenter(
      req.params.groupId,
      req.user._id.toString()
    );
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Settlements] Get center error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/splits/settlements/balances/:groupId
 * @desc    Get all member balances in a group
 * @access  Private
 */
router.get('/settlements/balances/:groupId', auth, async (req, res) => {
  try {
    const balances = await settlementService.getMemberBalances(req.params.groupId);
    
    res.json({
      success: true,
      data: balances
    });
  } catch (error) {
    console.error('[Settlements] Get balances error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/splits/settlements/original/:groupId
 * @desc    Get original (non-simplified) debts graph
 * @access  Private
 */
router.get('/settlements/original/:groupId', auth, async (req, res) => {
  try {
    const debts = await settlementService.getOriginalDebts(req.params.groupId);
    
    res.json({
      success: true,
      count: debts.length,
      data: debts
    });
  } catch (error) {
    console.error('[Settlements] Get original debts error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/splits/settlements/create-optimized/:groupId
 * @desc    Create optimized settlement records from simplified debts
 * @access  Private
 */
router.post('/settlements/create-optimized/:groupId', auth, async (req, res) => {
  try {
    const result = await settlementService.createOptimizedSettlements(
      req.params.groupId,
      req.user._id
    );
    
    res.status(201).json({
      success: true,
      message: `Created ${result.settlements.length} optimized settlements`,
      data: result
    });
  } catch (error) {
    console.error('[Settlements] Create optimized error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/splits/settlements/:id/request
 * @desc    Request settlement (debtor marks payment as sent)
 * @access  Private
 */
router.post('/settlements/:id/request', auth, async (req, res) => {
  try {
    const { error, value } = settlementSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const settlement = await settlementService.requestSettlement(
      req.params.id,
      req.user._id,
      value
    );
    
    res.json({
      success: true,
      message: 'Settlement request sent to creditor',
      data: settlement
    });
  } catch (error) {
    console.error('[Settlements] Request error:', error);
    if (error.message.includes('not found') || error.message.includes('Only the')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/splits/settlements/:id/confirm
 * @desc    Confirm settlement (creditor confirms receipt)
 * @access  Private
 */
router.post('/settlements/:id/confirm', auth, async (req, res) => {
  try {
    const settlement = await settlementService.confirmSettlement(
      req.params.id,
      req.user._id
    );
    
    res.json({
      success: true,
      message: 'Settlement confirmed successfully',
      data: settlement
    });
  } catch (error) {
    console.error('[Settlements] Confirm error:', error);
    if (error.message.includes('not found') || error.message.includes('Only the')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/splits/settlements/:id/reject
 * @desc    Reject settlement (creditor rejects)
 * @access  Private
 */
router.post('/settlements/:id/reject', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

    const settlement = await settlementService.rejectSettlement(
      req.params.id,
      req.user._id,
      reason
    );
    
    res.json({
      success: true,
      message: 'Settlement rejected',
      data: settlement
    });
  } catch (error) {
    console.error('[Settlements] Reject error:', error);
    if (error.message.includes('not found') || error.message.includes('Only the')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
