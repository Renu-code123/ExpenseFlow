const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const BillService = require('../services/billService');
const Bill = require('../models/Bill');
const BillPayment = require('../models/BillPayment');

/**
 * @route   POST /api/bills
 * @desc    Create a new bill
 * @access  Private
 */
router.post('/', auth, async (req, res) => {
    try {
        const bill = await BillService.createBill(req.user.userId, req.body);
        
        res.status(201).json({
            success: true,
            data: bill,
            message: 'Bill created successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/bills
 * @desc    Get all bills
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
    try {
        const { status, category, frequency, auto_pay } = req.query;
        
        const filter = { user: req.user.userId };
        
        if (status) filter.status = status;
        if (category) filter.category = category;
        if (frequency) filter.frequency = frequency;
        if (auto_pay !== undefined) filter['auto_pay.enabled'] = auto_pay === 'true';
        
        const bills = await Bill.find(filter)
            .populate('account', 'name type')
            .sort({ next_due_date: 1 });
        
        res.json({
            success: true,
            count: bills.length,
            data: bills
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/bills/upcoming
 * @desc    Get upcoming bills
 * @access  Private
 */
router.get('/upcoming', auth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        
        const bills = await BillService.getUpcomingBills(req.user.userId, days);
        
        res.json({
            success: true,
            count: bills.length,
            days,
            data: bills
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/bills/overdue
 * @desc    Get overdue bills
 * @access  Private
 */
router.get('/overdue', auth, async (req, res) => {
    try {
        const bills = await BillService.getOverdueBills(req.user.userId);
        
        res.json({
            success: true,
            count: bills.length,
            data: bills
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/bills/today
 * @desc    Get bills due today
 * @access  Private
 */
router.get('/today', auth, async (req, res) => {
    try {
        const bills = await BillService.getBillsDueToday(req.user.userId);
        
        res.json({
            success: true,
            count: bills.length,
            data: bills
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/bills/stats
 * @desc    Get bill statistics
 * @access  Private
 */
router.get('/stats', auth, async (req, res) => {
    try {
        const stats = await BillService.getBillStatistics(req.user.userId);
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/bills/category
 * @desc    Get bills grouped by category
 * @access  Private
 */
router.get('/category', auth, async (req, res) => {
    try {
        const billsByCategory = await BillService.getBillsByCategory(req.user.userId);
        
        res.json({
            success: true,
            data: billsByCategory
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/bills/:id
 * @desc    Get single bill
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
    try {
        const bill = await Bill.findOne({
            _id: req.params.id,
            user: req.user.userId
        }).populate('account', 'name type');
        
        if (!bill) {
            return res.status(404).json({
                success: false,
                error: 'Bill not found'
            });
        }
        
        // Get payment history
        const payments = await BillPayment.getPaymentHistory(bill._id);
        
        res.json({
            success: true,
            data: {
                bill,
                payments
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/bills/:id
 * @desc    Update bill
 * @access  Private
 */
router.put('/:id', auth, async (req, res) => {
    try {
        const bill = await BillService.updateBill(
            req.user.userId,
            req.params.id,
            req.body
        );
        
        res.json({
            success: true,
            data: bill,
            message: 'Bill updated successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   DELETE /api/bills/:id
 * @desc    Delete bill
 * @access  Private
 */
router.delete('/:id', auth, async (req, res) => {
    try {
        await BillService.deleteBill(req.user.userId, req.params.id);
        
        res.json({
            success: true,
            message: 'Bill deleted successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/bills/:id/pay
 * @desc    Record payment for bill
 * @access  Private
 */
router.post('/:id/pay', auth, async (req, res) => {
    try {
        const result = await BillService.recordPayment(
            req.user.userId,
            req.params.id,
            req.body
        );
        
        res.json({
            success: true,
            data: result,
            message: 'Payment recorded successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/bills/:id/skip
 * @desc    Skip next bill payment
 * @access  Private
 */
router.post('/:id/skip', auth, async (req, res) => {
    try {
        const bill = await BillService.skipBill(req.user.userId, req.params.id);
        
        res.json({
            success: true,
            data: bill,
            message: 'Bill skipped successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/bills/:id/pause
 * @desc    Pause recurring bill
 * @access  Private
 */
router.post('/:id/pause', auth, async (req, res) => {
    try {
        const bill = await BillService.pauseBill(req.user.userId, req.params.id);
        
        res.json({
            success: true,
            data: bill,
            message: 'Bill paused successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/bills/:id/resume
 * @desc    Resume paused bill
 * @access  Private
 */
router.post('/:id/resume', auth, async (req, res) => {
    try {
        const bill = await BillService.resumeBill(req.user.userId, req.params.id);
        
        res.json({
            success: true,
            data: bill,
            message: 'Bill resumed successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/bills/:id/payments
 * @desc    Get payment history for bill
 * @access  Private
 */
router.get('/:id/payments', auth, async (req, res) => {
    try {
        const bill = await Bill.findOne({
            _id: req.params.id,
            user: req.user.userId
        });
        
        if (!bill) {
            return res.status(404).json({
                success: false,
                error: 'Bill not found'
            });
        }
        
        const payments = await BillPayment.getPaymentHistory(req.params.id);
        const stats = await BillPayment.getPaymentStats(req.params.id);
        
        res.json({
            success: true,
            data: {
                payments,
                stats
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
