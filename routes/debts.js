const express = require('express');
const Joi = require('joi');
const auth = require('../middleware/auth');
const Debt = require('../models/Debt');
const debtService = require('../services/debtService');
const { validateDebt, validateDebtUpdate, validatePayment } = require('../middleware/debtValidator');
const router = express.Router();

/**
 * @route   GET /api/debts
 * @desc    Get all debts for user
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const { status, loanType, priority, sortBy = 'createdAt', order = 'desc' } = req.query;
    
    let query = { user: req.user._id, isActive: true };
    
    if (status) query.status = status;
    if (loanType) query.loanType = loanType;
    if (priority) query.priority = priority;
    
    const sortOrder = order === 'asc' ? 1 : -1;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder;
    
    const debts = await Debt.find(query).sort(sortOptions);
    
    res.json({ 
      success: true, 
      count: debts.length,
      data: debts 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/debts/summary
 * @desc    Get debt summary dashboard
 * @access  Private
 */
router.get('/summary', auth, async (req, res) => {
  try {
    const summary = await debtService.getDebtSummary(req.user._id);
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/debts/attention
 * @desc    Get debts needing attention
 * @access  Private
 */
router.get('/attention', auth, async (req, res) => {
  try {
    const attentionNeeded = await debtService.getDebtsNeedingAttention(req.user._id);
    res.json({ success: true, data: attentionNeeded });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/debts/recommendations
 * @desc    Get payoff recommendations
 * @access  Private
 */
router.get('/recommendations', auth, async (req, res) => {
  try {
    const { strategy = 'avalanche' } = req.query;
    const recommendations = await debtService.getPayoffRecommendations(req.user._id, strategy);
    res.json({ success: true, data: recommendations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/debts
 * @desc    Create a new debt
 * @access  Private
 */
router.post('/', auth, validateDebt, async (req, res) => {
  try {
    const debt = new Debt({
      ...req.body,
      user: req.user._id
    });
    
    // Set next payment date if not provided
    if (!debt.nextPaymentDate) {
      const nextDate = new Date();
      nextDate.setMonth(nextDate.getMonth() + 1);
      debt.nextPaymentDate = nextDate;
    }
    
    await debt.save();
    
    res.status(201).json({ 
      success: true, 
      message: 'Debt created successfully',
      data: debt 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/debts/:id
 * @desc    Get specific debt with amortization
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const debt = await Debt.findOne({ _id: req.params.id, user: req.user._id });
    
    if (!debt) {
      return res.status(404).json({ success: false, error: 'Debt not found' });
    }
    
    // Get amortization schedule
    const amortizationSchedule = debtService.calculateAmortizationSchedule(debt);
    
    // Get early payoff analysis with extra $100/month
    const earlyPayoffAnalysis = debtService.calculateEarlyPayoffAnalysis(debt, 100);
    
    res.json({ 
      success: true, 
      data: {
        ...debt.toJSON(),
        amortizationSchedule: amortizationSchedule.slice(0, 12), // First 12 months
        earlyPayoffAnalysis
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   PUT /api/debts/:id
 * @desc    Update a debt
 * @access  Private
 */
router.put('/:id', auth, validateDebtUpdate, async (req, res) => {
  try {
    const debt = await Debt.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!debt) {
      return res.status(404).json({ success: false, error: 'Debt not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Debt updated successfully',
      data: debt 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   DELETE /api/debts/:id
 * @desc    Delete a debt (soft delete)
 * @access  Private
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const debt = await Debt.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isActive: false },
      { new: true }
    );
    
    if (!debt) {
      return res.status(404).json({ success: false, error: 'Debt not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Debt deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/debts/:id/payments
 * @desc    Record a payment
 * @access  Private
 */
router.post('/:id/payments', auth, validatePayment, async (req, res) => {
  try {
    const result = await debtService.recordPayment(
      req.params.id, 
      req.user._id, 
      req.body
    );
    
    res.json({ 
      success: true, 
      message: result.isPaidOff ? 'Congratulations! Debt is fully paid off!' : 'Payment recorded successfully',
      data: {
        debt: result.debt,
        payment: result.payment,
        isPaidOff: result.isPaidOff
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/debts/:id/amortization
 * @desc    Get full amortization schedule
 * @access  Private
 */
router.get('/:id/amortization', auth, async (req, res) => {
  try {
    const debt = await Debt.findOne({ _id: req.params.id, user: req.user._id });
    
    if (!debt) {
      return res.status(404).json({ success: false, error: 'Debt not found' });
    }
    
    const { extraPayment = 0 } = req.query;
    const schedule = debtService.calculateAmortizationSchedule(debt, parseFloat(extraPayment));
    
    res.json({ 
      success: true, 
      data: {
        debtId: debt._id,
        name: debt.name,
        totalMonths: schedule.length,
        totalInterest: schedule[schedule.length - 1]?.totalInterestToDate || 0,
        schedule
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/debts/:id/payments
 * @desc    Get payment history
 * @access  Private
 */
router.get('/:id/payments', auth, async (req, res) => {
  try {
    const debt = await Debt.findOne({ _id: req.params.id, user: req.user._id });
    
    if (!debt) {
      return res.status(404).json({ success: false, error: 'Debt not found' });
    }
    
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const payments = debt.payments
      .sort((a, b) => b.date - a.date)
      .slice(skip, skip + parseInt(limit));
    
    res.json({ 
      success: true, 
      data: {
        payments,
        total: debt.payments.length,
        page: parseInt(page),
        pages: Math.ceil(debt.payments.length / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/debts/consolidate
 * @desc    Consolidate multiple debts
 * @access  Private
 */
router.post('/consolidate', auth, async (req, res) => {
  try {
    const { debtIds, ...consolidationData } = req.body;
    
    if (!debtIds || !Array.isArray(debtIds) || debtIds.length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'At least 2 debt IDs required for consolidation' 
      });
    }
    
    const result = await debtService.consolidateDebts(
      debtIds, 
      req.user._id, 
      consolidationData
    );
    
    res.json({ 
      success: true, 
      message: 'Debts consolidated successfully',
      data: result
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/debts/analyze/dti
 * @desc    Calculate debt-to-income ratio
 * @access  Private
 */
router.post('/analyze/dti', auth, async (req, res) => {
  try {
    const { monthlyIncome } = req.body;
    
    if (!monthlyIncome || monthlyIncome <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid monthly income is required' 
      });
    }
    
    const dti = await debtService.calculateDebtToIncomeRatio(
      req.user._id, 
      monthlyIncome
    );
    
    res.json({ success: true, data: dti });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/debts/:id/calculate-payoff
 * @desc    Calculate early payoff scenarios
 * @access  Private
 */
router.post('/:id/calculate-payoff', auth, async (req, res) => {
  try {
    const debt = await Debt.findOne({ _id: req.params.id, user: req.user._id });
    
    if (!debt) {
      return res.status(404).json({ success: false, error: 'Debt not found' });
    }
    
    const { extraPayment = 0 } = req.body;
    const analysis = debtService.calculateEarlyPayoffAnalysis(
      debt, 
      parseFloat(extraPayment)
    );
    
    res.json({ success: true, data: analysis });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
