const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const PaymentService = require('../services/paymentService');
const PDFService = require('../services/pdfService');
const { authenticateToken } = require('../middleware/auth');
const { PaymentSchemas, validateRequest, validateQuery, validateParams } = require('../middleware/inputValidator');
const { body, param, query, validationResult } = require('express-validator');

// GET /api/payments - Get all payments for user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { client, invoice, status, payment_method, start_date, end_date, page = 1, limit = 50 } = req.query;
        
        const filters = {};
        if (client) filters.client = client;
        if (invoice) filters.invoice = invoice;
        if (status) filters.status = status;
        if (payment_method) filters.payment_method = payment_method;
        if (start_date && end_date) {
            filters.start_date = start_date;
            filters.end_date = end_date;
        }
        
        const result = await PaymentService.getPayments(
            req.user.userId,
            filters,
            parseInt(page),
            parseInt(limit)
        );
        
        res.json({
            success: true,
            count: result.payments.length,
            data: result.payments,
            pagination: result.pagination
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/payments/unreconciled - Get unreconciled payments
router.get('/unreconciled', authenticateToken, async (req, res) => {
    try {
        const payments = await PaymentService.getUnreconciledPayments(req.user.userId);
        
        res.json({
            success: true,
            count: payments.length,
            data: payments
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/payments/stats - Get payment statistics
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        const stats = await PaymentService.getPaymentStatistics(
            req.user.userId,
            start_date,
            end_date
        );
        
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

// GET /api/payments/revenue/monthly - Get monthly revenue
router.get('/revenue/monthly', authenticateToken, async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        
        const revenue = await PaymentService.getMonthlyRevenue(req.user.userId, year);
        
        res.json({
            success: true,
            year,
            data: revenue
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/payments/forecast - Get payment forecast
router.get('/forecast', authenticateToken, async (req, res) => {
    try {
        const forecast = await PaymentService.getPaymentForecast(req.user.userId);
        
        res.json({
            success: true,
            data: forecast
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/payments/:id - Get single payment
router.get('/:id', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const payment = await PaymentService.getPayment(req.user.userId, req.params.id);
        
        res.json({
            success: true,
            data: payment
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/payments - Create new payment
router.post('/', authenticateToken, validateRequest(PaymentSchemas.create), async (req, res) => {
    try {
        const payment = await PaymentService.createPayment(req.user.userId, req.body);
        
        res.status(201).json({
            success: true,
            data: payment
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// PUT /api/payments/:id - Update payment
router.put('/:id', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const payment = await PaymentService.updatePayment(
            req.user.userId,
            req.params.id,
            req.body
        );
        
        res.json({
            success: true,
            data: payment
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/payments/:id/refund - Process refund
router.post('/:id/refund', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const { refund_amount, reason } = req.body;
        
        if (!refund_amount || !reason) {
            return res.status(400).json({
                success: false,
                error: 'Refund amount and reason are required'
            });
        }
        
        const payment = await PaymentService.processRefund(
            req.user.userId,
            req.params.id,
            refund_amount,
            reason
        );
        
        res.json({
            success: true,
            data: payment
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/payments/:id/reconcile - Mark payment as reconciled
router.post('/:id/reconcile', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const payment = await PaymentService.reconcilePayment(req.user.userId, req.params.id);
        
        res.json({
            success: true,
            data: payment
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/payments/reconcile/bulk - Reconcile multiple payments
router.post('/reconcile/bulk', authenticateToken, async (req, res) => {
    try {
        const { payment_ids } = req.body;
        
        if (!payment_ids || !Array.isArray(payment_ids) || payment_ids.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'payment_ids array is required'
            });
        }
        
        const result = await PaymentService.reconcilePayments(req.user.userId, payment_ids);
        
        res.json({
            success: true,
            message: `${result.count} payment(s) reconciled`,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/payments/:id/receipt - Generate and download receipt PDF
router.get('/:id/receipt', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const result = await PDFService.generateReceiptPDF(req.params.id, req.user.userId);
        
        res.download(result.pdfPath);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/payments/client/:clientId/history - Get payment history for a client
router.get('/client/:clientId/history', authenticateToken, param('clientId').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const { page = 1, limit = 50 } = req.query;
        
        const result = await PaymentService.getClientPaymentHistory(
            req.user.userId,
            req.params.clientId,
            parseInt(page),
            parseInt(limit)
        );
        
        res.json({
            success: true,
            data: result.payments,
            summary: result.summary,
            pagination: result.pagination
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
