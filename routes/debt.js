/**
 * Debt Routes
 * Issue #520: Comprehensive Debt Management & Amortization Engine
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const debtService = require('../services/debtService');
const DebtAccount = require('../models/DebtAccount');
const AmortizationSchedule = require('../models/AmortizationSchedule');

/**
 * @route   POST /api/debt
 * @desc    Create a new debt account
 * @access  Private
 */
router.post('/', auth, async (req, res) => {
    try {
        const debt = await debtService.createDebt(req.user._id, req.body);

        res.status(201).json({
            success: true,
            data: debt
        });
    } catch (error) {
        console.error('[Debt Routes] Create debt error:', error);
        res.status(500).json({
            error: error.message || 'Failed to create debt account'
        });
    }
});

/**
 * @route   GET /api/debt
 * @desc    Get all debt accounts for user
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
    try {
        const { status } = req.query;
        const query = { userId: req.user._id };

        if (status) {
            query.status = status;
        }

        const debts = await DebtAccount.find(query).sort({ createdAt: -1 });

        res.json({
            success: true,
            count: debts.length,
            data: debts
        });
    } catch (error) {
        console.error('[Debt Routes] Get debts error:', error);
        res.status(500).json({
            error: 'Failed to fetch debts'
        });
    }
});

/**
 * @route   GET /api/debt/dashboard
 * @desc    Get debt dashboard summary
 * @access  Private
 */
router.get('/dashboard', auth, async (req, res) => {
    try {
        const summary = await debtService.getDashboardSummary(req.user._id);

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error('[Debt Routes] Dashboard error:', error);
        res.status(500).json({
            error: 'Failed to fetch dashboard data'
        });
    }
});

/**
 * @route   GET /api/debt/:id
 * @desc    Get specific debt account
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
    try {
        const debt = await DebtAccount.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!debt) {
            return res.status(404).json({
                error: 'Debt account not found'
            });
        }

        res.json({
            success: true,
            data: debt
        });
    } catch (error) {
        console.error('[Debt Routes] Get debt error:', error);
        res.status(500).json({
            error: 'Failed to fetch debt'
        });
    }
});

/**
 * @route   PUT /api/debt/:id
 * @desc    Update debt account
 * @access  Private
 */
router.put('/:id', auth, async (req, res) => {
    try {
        const debt = await DebtAccount.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            req.body,
            { new: true, runValidators: true }
        );

        if (!debt) {
            return res.status(404).json({
                error: 'Debt account not found'
            });
        }

        res.json({
            success: true,
            data: debt
        });
    } catch (error) {
        console.error('[Debt Routes] Update debt error:', error);
        res.status(500).json({
            error: 'Failed to update debt'
        });
    }
});

/**
 * @route   DELETE /api/debt/:id
 * @desc    Delete debt account
 * @access  Private
 */
router.delete('/:id', auth, async (req, res) => {
    try {
        const debt = await DebtAccount.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!debt) {
            return res.status(404).json({
                error: 'Debt account not found'
            });
        }

        // Delete associated amortization schedules
        await AmortizationSchedule.deleteMany({ debtAccountId: req.params.id });

        res.json({
            success: true,
            message: 'Debt account deleted'
        });
    } catch (error) {
        console.error('[Debt Routes] Delete debt error:', error);
        res.status(500).json({
            error: 'Failed to delete debt'
        });
    }
});

/**
 * @route   POST /api/debt/:id/payment
 * @desc    Record a payment
 * @access  Private
 */
router.post('/:id/payment', auth, async (req, res) => {
    try {
        const { amount, date } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                error: 'Valid payment amount is required'
            });
        }

        const paymentResult = await debtService.recordPayment(
            req.params.id,
            amount,
            date ? new Date(date) : undefined
        );

        res.json({
            success: true,
            data: paymentResult
        });
    } catch (error) {
        console.error('[Debt Routes] Record payment error:', error);
        res.status(500).json({
            error: error.message || 'Failed to record payment'
        });
    }
});

/**
 * @route   GET /api/debt/:id/amortization
 * @desc    Get amortization schedule
 * @access  Private
 */
router.get('/:id/amortization', auth, async (req, res) => {
    try {
        const { scheduleType = 'standard' } = req.query;

        let schedule = await AmortizationSchedule.findOne({
            debtAccountId: req.params.id,
            userId: req.user._id,
            scheduleType
        });

        if (!schedule) {
            // Generate if doesn't exist
            schedule = await debtService.generateAmortizationSchedule(
                req.params.id,
                0,
                scheduleType
            );
        }

        res.json({
            success: true,
            data: schedule
        });
    } catch (error) {
        console.error('[Debt Routes] Get amortization error:', error);
        res.status(500).json({
            error: 'Failed to fetch amortization schedule'
        });
    }
});

/**
 * @route   POST /api/debt/:id/amortization/generate
 * @desc    Generate new amortization schedule with extra payments
 * @access  Private
 */
router.post('/:id/amortization/generate', auth, async (req, res) => {
    try {
        const { extraPayment = 0, scheduleType = 'with_extra' } = req.body;

        const schedule = await debtService.generateAmortizationSchedule(
            req.params.id,
            extraPayment,
            scheduleType
        );

        res.json({
            success: true,
            data: schedule
        });
    } catch (error) {
        console.error('[Debt Routes] Generate amortization error:', error);
        res.status(500).json({
            error: 'Failed to generate amortization schedule'
        });
    }
});

/**
 * @route   GET /api/debt/strategies/compare
 * @desc    Compare repayment strategies (Snowball vs Avalanche)
 * @access  Private
 */
router.get('/strategies/compare', auth, async (req, res) => {
    try {
        const { extraPayment = 0 } = req.query;

        const comparison = await debtService.compareStrategies(
            req.user._id,
            parseFloat(extraPayment)
        );

        res.json({
            success: true,
            data: comparison
        });
    } catch (error) {
        console.error('[Debt Routes] Compare strategies error:', error);
        res.status(500).json({
            error: 'Failed to compare strategies'
        });
    }
});

/**
 * @route   GET /api/debt/:id/payoff-acceleration
 * @desc    Calculate payoff acceleration with extra payments
 * @access  Private
 */
router.get('/:id/payoff-acceleration', auth, async (req, res) => {
    try {
        const { extraPayment } = req.query;

        if (!extraPayment || extraPayment <= 0) {
            return res.status(400).json({
                error: 'Valid extra payment amount is required'
            });
        }

        const acceleration = await debtService.calculatePayoffAcceleration(
            req.params.id,
            parseFloat(extraPayment)
        );

        res.json({
            success: true,
            data: acceleration
        });
    } catch (error) {
        console.error('[Debt Routes] Payoff acceleration error:', error);
        res.status(500).json({
            error: 'Failed to calculate payoff acceleration'
        });
    }
});

/**
 * @route   GET /api/debt/dti-ratio
 * @desc    Get debt-to-income ratio
 * @access  Private
 */
router.get('/dti-ratio', auth, async (req, res) => {
    try {
        const { monthlyIncome } = req.query;

        if (!monthlyIncome || monthlyIncome <= 0) {
            return res.status(400).json({
                error: 'Valid monthly income is required'
            });
        }

        const dtiData = await debtService.calculateDebtToIncome(
            req.user._id,
            parseFloat(monthlyIncome)
        );

        res.json({
            success: true,
            data: dtiData
        });
    } catch (error) {
        console.error('[Debt Routes] DTI ratio error:', error);
        res.status(500).json({
            error: 'Failed to calculate DTI ratio'
        });
    }
});

/**
 * @route   POST /api/debt/:id/refinance-analysis
 * @desc    Analyze refinancing options
 * @access  Private
 */
router.post('/:id/refinance-analysis', auth, async (req, res) => {
    try {
        const { newInterestRate, newTermMonths } = req.body;

        if (!newInterestRate || newInterestRate < 0) {
            return res.status(400).json({
                error: 'Valid interest rate is required'
            });
        }

        const analysis = await debtService.analyzeRefinancing(
            req.params.id,
            newInterestRate,
            newTermMonths
        );

        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        console.error('[Debt Routes] Refinance analysis error:', error);
        res.status(500).json({
            error: error.message || 'Failed to analyze refinancing'
        });
    }
});

/**
 * @route   POST /api/debt/calculate-payment
 * @desc    Calculate monthly payment for given parameters
 * @access  Private
 */
router.post('/calculate-payment', auth, async (req, res) => {
    try {
        const { principal, annualRate, termMonths } = req.body;

        if (!principal || !annualRate || !termMonths) {
            return res.status(400).json({
                error: 'Principal, annual rate, and term are required'
            });
        }

        const monthlyPayment = debtService.calculateMonthlyPayment(
            parseFloat(principal),
            parseFloat(annualRate),
            parseInt(termMonths)
        );

        const totalInterest = debtService.calculateTotalInterest(
            parseFloat(principal),
            monthlyPayment,
            parseInt(termMonths)
        );

        res.json({
            success: true,
            data: {
                monthlyPayment,
                totalPayments: monthlyPayment * termMonths,
                totalInterest,
                totalPrincipal: principal
            }
        });
    } catch (error) {
        console.error('[Debt Routes] Calculate payment error:', error);
        res.status(500).json({
            error: 'Failed to calculate payment'
        });
    }
});

module.exports = router;
