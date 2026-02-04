const express = require('express');
const Joi = require('joi');
const Transaction = require('../models/Transaction');
const budgetService = require('../services/budgetService');
const categorizationService = require('../services/categorizationService');
const exportService = require('../services/exportService');
const currencyService = require('../services/currencyService'); // Added for currency conversion
const aiService = require('../services/aiService');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

const transactionSchema = Joi.object({
    description: Joi.string().trim().max(100).required(),
    amount: Joi.number().min(0.01).required(),
    currency: Joi.string().uppercase().optional(),
    category: Joi.string().valid('food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other', 'salary', 'freelance', 'investment', 'transfer').required(),
    type: Joi.string().valid('income', 'expense', 'transfer').required(),
    kind: Joi.string().valid('income', 'expense', 'transfer').optional(),
    merchant: Joi.string().trim().max(50).optional(),
    date: Joi.date().optional(),
    workspaceId: Joi.string().hex().length(24).optional()
});

// GET all transactions for authenticated user with pagination support
router.get('/', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const user = await User.findById(req.user._id);

        // Workspace filtering
        const workspaceId = req.query.workspaceId;
        const query = workspaceId
            ? { workspace: workspaceId }
            : { user: req.user._id, workspace: null };

        // Get total count for pagination info
        const total = await Transaction.countDocuments(query);

        const transactions = await Transaction.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);

        // Convert transactions to user's preferred currency if needed
        const convertedTransactions = await Promise.all(transactions.map(async (transaction) => {
            const transactionObj = transaction.toObject();

            // If transaction currency differs from user preference, show converted amount
            if (transactionObj.originalCurrency !== user.preferredCurrency) {
                try {
                    const conversion = await currencyService.convertCurrency(
                        transactionObj.originalAmount,
                        transactionObj.originalCurrency,
                        user.preferredCurrency
                    );
                    transactionObj.displayAmount = conversion.convertedAmount;
                    transactionObj.displayCurrency = user.preferredCurrency;
                } catch (error) {
                    // If conversion fails, use original amount
                    transactionObj.displayAmount = transactionObj.amount;
                    transactionObj.displayCurrency = transactionObj.originalCurrency;
                }
            } else {
                transactionObj.displayAmount = transactionObj.amount;
                transactionObj.displayCurrency = transactionObj.originalCurrency;
            }

            return transactionObj;
        }));

        res.json({
            success: true,
            data: convertedTransactions,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST new transaction for authenticated user
router.post('/', auth, async (req, res) => {
    try {
        const { error, value } = transactionSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const transactionService = require('../services/transactionService');
        const io = req.app.get('io');

        const transaction = await transactionService.createTransaction(value, req.user._id, io);

        // Add display fields for backward compatibility with UI
        const user = await User.findById(req.user._id);
        const response = transaction.toObject();

        if (response.originalCurrency !== user.preferredCurrency && response.convertedAmount) {
            response.displayAmount = response.convertedAmount;
            response.displayCurrency = user.preferredCurrency;
        } else {
            response.displayAmount = response.amount;
            response.displayCurrency = response.originalCurrency;
        }

        res.status(201).json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update transaction
router.put('/:id', auth, async (req, res) => {
    try {
        const transaction = await Transaction.findOne({ _id: req.params.id, user: req.user._id });

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // If updating amount, reverse old impact on Goal
        if (req.body.amount && req.body.type === 'expense') {
            const oldAmount = transaction.convertedAmount || transaction.amount;
            await budgetService.updateGoalProgress(req.user._id, oldAmount, transaction.category); // Add back
        }

        Object.assign(transaction, req.body);

        // Simple create wrapper re-save logic or just save. simpler here:
        if (req.body.amount || req.body.currency) {
            const user = await User.findById(req.user._id);
            const currency = req.body.currency || transaction.originalCurrency || 'INR';
            // If currency changed, re-convert
            if (currency !== user.preferredCurrency) {
                const conversion = await currencyService.convertCurrency(req.body.amount || transaction.amount, currency, user.preferredCurrency);
                transaction.convertedAmount = conversion.convertedAmount;
                transaction.convertedCurrency = user.preferredCurrency;
                transaction.exchangeRate = conversion.exchangeRate;
            }
            transaction.originalAmount = req.body.amount || transaction.amount;
            transaction.originalCurrency = currency;
        }

        await transaction.save();

        // Re-apply goal impact
        if (req.body.amount && req.body.type === 'expense') {
            const newAmount = transaction.convertedAmount || transaction.amount;
            await budgetService.updateGoalProgress(req.user._id, -newAmount, transaction.category); // Deduct new
        }

        res.json(transaction);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete transaction
router.delete('/:id', auth, async (req, res) => {
    try {
        const transaction = await Transaction.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Reverse goal impact
        if (transaction.type === 'expense') {
            const amount = transaction.convertedAmount || transaction.amount;
            await budgetService.updateGoalProgress(req.user._id, amount, transaction.category);
        }

        res.json({ message: 'Transaction deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
