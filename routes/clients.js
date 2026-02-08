const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Invoice = require('../models/Invoice');
const auth = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

// Validation middleware
const validateClient = [
    body('name').trim().notEmpty().withMessage('Client name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('client_type').optional().isIn(['individual', 'company']),
    body('payment_terms').optional().isInt({ min: 0 }),
    body('currency').optional().isLength({ min: 3, max: 3 })
];

// GET /api/clients - Get all clients for user
router.get('/', auth, async (req, res) => {
    try {
        const { status, search, sort = 'name' } = req.query;
        
        const filters = {};
        if (status) filters.status = status;
        if (search) filters.search = search;
        
        const clients = await Client.getUserClients(req.user.userId, filters);
        
        res.json({
            success: true,
            count: clients.length,
            data: clients
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/clients/top - Get top clients by revenue
router.get('/top', auth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        
        const topClients = await Client.getTopClients(req.user.userId, limit);
        
        res.json({
            success: true,
            count: topClients.length,
            data: topClients
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/clients/outstanding - Get clients with outstanding balance
router.get('/outstanding', auth, async (req, res) => {
    try {
        const clients = await Client.getClientsWithOutstandingBalance(req.user.userId);
        
        res.json({
            success: true,
            count: clients.length,
            data: clients
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/clients/:id - Get single client
router.get('/:id', auth, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const client = await Client.findOne({
            _id: req.params.id,
            user: req.user.userId
        });
        
        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }
        
        // Get client's invoices
        const invoices = await Invoice.find({
            client: client._id,
            user: req.user.userId
        })
            .select('invoice_number invoice_date due_date total amount_paid status')
            .sort({ invoice_date: -1 })
            .limit(10);
        
        res.json({
            success: true,
            data: {
                client,
                recent_invoices: invoices
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/clients - Create new client
router.post('/', auth, validateClient, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const client = new Client({
            user: req.user.userId,
            ...req.body
        });
        
        await client.save();
        
        res.status(201).json({
            success: true,
            data: client
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                error: 'Client with this email already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// PUT /api/clients/:id - Update client
router.put('/:id', auth, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const client = await Client.findOne({
            _id: req.params.id,
            user: req.user.userId
        });
        
        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }
        
        // Update fields
        Object.assign(client, req.body);
        await client.save();
        
        res.json({
            success: true,
            data: client
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// DELETE /api/clients/:id - Delete client
router.delete('/:id', auth, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const client = await Client.findOne({
            _id: req.params.id,
            user: req.user.userId
        });
        
        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }
        
        // Check if client has invoices
        const invoiceCount = await Invoice.countDocuments({
            client: client._id,
            user: req.user.userId
        });
        
        if (invoiceCount > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete client with existing invoices'
            });
        }
        
        await client.deleteOne();
        
        res.json({
            success: true,
            message: 'Client deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/clients/:id/invoices - Get all invoices for a client
router.get('/:id/invoices', auth, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const { status, page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const query = {
            client: req.params.id,
            user: req.user.userId
        };
        
        if (status) {
            query.status = status;
        }
        
        const invoices = await Invoice.find(query)
            .sort({ invoice_date: -1 })
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

// GET /api/clients/:id/stats - Get client statistics
router.get('/:id/stats', auth, param('id').isMongoId(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const client = await Client.findOne({
            _id: req.params.id,
            user: req.user.userId
        });
        
        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }
        
        // Calculate average payment time
        await client.calculateAveragePaymentTime();
        
        // Get invoice breakdown
        const invoiceBreakdown = await Invoice.aggregate([
            {
                $match: {
                    client: client._id,
                    user: req.user.userId
                }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    total_amount: { $sum: '$total' }
                }
            }
        ]);
        
        res.json({
            success: true,
            data: {
                total_billed: client.total_billed,
                total_paid: client.total_paid,
                outstanding_balance: client.outstanding_balance,
                invoice_count: client.invoice_count,
                average_payment_time: client.average_payment_time,
                last_invoice_date: client.last_invoice_date,
                last_payment_date: client.last_payment_date,
                invoice_breakdown: invoiceBreakdown
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
