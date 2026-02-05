const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const InvoiceService = require('../services/invoiceService');
const PDFService = require('../services/pdfService');
const ReminderService = require('../services/reminderService');
const { authenticateToken } = require('../middleware/auth');
const { InvoiceSchemas, validateRequest, validateQuery, validateParams } = require('../middleware/inputValidator');
const { invoiceLimiter, invoicePaymentLimiter, exportLimiter, reportLimiter } = require('../middleware/rateLimiter');
const { body, param, query, validationResult } = require('express-validator');

// GET /api/invoices - Get all invoices for user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { status, client, page = 1, limit = 50, sort = '-invoice_date' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const query = { user: req.user.userId };
        
        if (status) {
            if (status.includes(',')) {
                query.status = { $in: status.split(',') };
            } else {
                query.status = status;
            }
        }
        
        if (client) {
            query.client = client;
        }
        
        const invoices = await Invoice.find(query)
            .populate('client', 'name company_name email')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Invoice.countDocuments(query);
        
        res.json({
            success: true,
            count: invoices.length,
            data: invoices,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/invoices/overdue - Get overdue invoices
router.get('/overdue', authenticateToken, async (req, res) => {
    try {
        const overdueInvoices = await Invoice.getOverdueInvoices(req.user.userId);
        
        res.json({
            success: true,
            count: overdueInvoices.length,
            data: overdueInvoices
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/invoices/upcoming - Get upcoming invoices
router.get('/upcoming', authenticateToken, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const upcomingInvoices = await Invoice.getUpcomingInvoices(req.user.userId, days);
        
        res.json({
            success: true,
            count: upcomingInvoices.length,
            data: upcomingInvoices
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/invoices/stats - Get invoice statistics
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        const startDate = start_date ? new Date(start_date) : null;
        const endDate = end_date ? new Date(end_date) : null;
        
        const stats = await InvoiceService.getInvoiceStatistics(
            req.user.userId,
            startDate,
            endDate
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

// GET /api/invoices/:id - Get single invoice
router.get('/:id', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const invoice = await Invoice.findOne({
            _id: req.params.id,
            user: req.user.userId
        })
            .populate('client')
            .populate('time_entries')
            .populate({
                path: 'expenses',
                select: 'description amount category date'
            });
        
        if (!invoice) {
            return res.status(404).json({
                success: false,
                error: 'Invoice not found'
            });
        }
        
        res.json({
            success: true,
            data: invoice
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/invoices - Create new invoice
router.post('/', authenticateToken, invoiceLimiter, validateRequest(InvoiceSchemas.create), async (req, res) => {
    try {
        const invoice = await InvoiceService.createInvoice(req.user.userId, req.body);
        
        res.status(201).json({
            success: true,
            data: invoice
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/invoices/from-time-entries - Create invoice from time entries
router.post('/from-time-entries', authenticateToken, async (req, res) => {
    try {
        const { client, time_entry_ids, ...invoiceData } = req.body;
        
        if (!client || !time_entry_ids || time_entry_ids.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Client and time_entry_ids are required'
            });
        }
        
        const invoice = await InvoiceService.createInvoiceFromTimeEntries(
            req.user.userId,
            client,
            time_entry_ids,
            invoiceData
        );
        
        res.status(201).json({
            success: true,
            data: invoice
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/invoices/from-expenses - Create invoice from expenses
router.post('/from-expenses', authenticateToken, async (req, res) => {
    try {
        const { client, expense_ids, ...invoiceData } = req.body;
        
        if (!client || !expense_ids || expense_ids.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Client and expense_ids are required'
            });
        }
        
        const invoice = await InvoiceService.createInvoiceFromExpenses(
            req.user.userId,
            client,
            expense_ids,
            invoiceData
        );
        
        res.status(201).json({
            success: true,
            data: invoice
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// PUT /api/invoices/:id - Update invoice
router.put('/:id', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const invoice = await InvoiceService.updateInvoice(
            req.user.userId,
            req.params.id,
            req.body
        );
        
        res.json({
            success: true,
            data: invoice
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// DELETE /api/invoices/:id - Delete invoice (drafts only)
router.delete('/:id', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const result = await InvoiceService.deleteInvoice(req.user.userId, req.params.id);
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/invoices/:id/send - Send invoice via email
router.post('/:id/send', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        await ReminderService.sendInvoiceEmail(req.params.id);
        
        res.json({
            success: true,
            message: 'Invoice sent successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/invoices/:id/payment - Record payment
router.post('/:id/payment', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const { amount, payment_method, transaction_id, notes } = req.body;
        
        if (!amount || !payment_method) {
            return res.status(400).json({
                success: false,
                error: 'Amount and payment_method are required'
            });
        }
        
        const result = await InvoiceService.recordPayment(req.user.userId, req.params.id, {
            amount,
            payment_method,
            transaction_id,
            notes
        });
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/invoices/:id/cancel - Cancel invoice
router.post('/:id/cancel', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const invoice = await Invoice.findOne({
            _id: req.params.id,
            user: req.user.userId
        });
        
        if (!invoice) {
            return res.status(404).json({
                success: false,
                error: 'Invoice not found'
            });
        }
        
        await invoice.cancel(req.body.reason || 'Cancelled by user');
        
        res.json({
            success: true,
            data: invoice
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/invoices/:id/pdf - Generate and download PDF
router.get('/:id/pdf', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const result = await PDFService.generateInvoicePDF(req.params.id, req.user.userId);
        
        res.download(result.pdfPath);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/invoices/:id/apply-late-fee - Apply late fee to invoice
router.post('/:id/apply-late-fee', authenticateToken, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const invoice = await Invoice.findOne({
            _id: req.params.id,
            user: req.user.userId
        });
        
        if (!invoice) {
            return res.status(404).json({
                success: false,
                error: 'Invoice not found'
            });
        }
        
        await invoice.applyLateFee();
        
        res.json({
            success: true,
            data: invoice
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/invoices/apply-late-fees - Apply late fees to all overdue invoices
router.post('/apply-late-fees', authenticateToken, async (req, res) => {
    try {
        const result = await InvoiceService.applyLateFees(req.user.userId);
        
        res.json({
            success: true,
            message: `Late fees applied to ${result.count} invoice(s)`,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
