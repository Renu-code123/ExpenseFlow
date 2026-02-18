const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const payrollService = require('../services/payrollService');
const SalaryStructure = require('../models/SalaryStructure');
const PayrollRun = require('../models/PayrollRun');
const EmployeePerk = require('../models/EmployeePerk');

/**
 * Get Payroll Dashboard
 */
router.get('/dashboard', auth, async (req, res) => {
    try {
        const dashboard = await payrollService.getPayrollDashboard(req.user._id);
        res.json({ success: true, data: dashboard });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Generate Payroll for a Period
 */
router.post('/generate', auth, async (req, res) => {
    try {
        const { month, year } = req.body;
        const payrollRun = await payrollService.generatePayroll(req.user._id, month, year);
        res.json({ success: true, data: payrollRun });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Get All Payroll Runs
 */
router.get('/runs', auth, async (req, res) => {
    try {
        const runs = await PayrollRun.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ success: true, data: runs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Specific Payroll Run
 */
router.get('/runs/:id', auth, async (req, res) => {
    try {
        const run = await PayrollRun.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }

        res.json({ success: true, data: run });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Approve Payroll Run
 */
router.post('/runs/:id/approve', auth, async (req, res) => {
    try {
        const payrollRun = await payrollService.approvePayroll(req.params.id, req.user._id);
        res.json({ success: true, data: payrollRun });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Process Payroll Run (Disburse Payments)
 */
router.post('/runs/:id/process', auth, async (req, res) => {
    try {
        const payrollRun = await payrollService.processPayroll(req.params.id);
        res.json({ success: true, data: payrollRun });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Get Employee Payslip
 */
router.get('/runs/:id/payslip/:employeeId', auth, async (req, res) => {
    try {
        const payslip = await payrollService.getPayslip(req.params.id, req.params.employeeId);
        res.json({ success: true, data: payslip });
    } catch (err) {
        res.status(404).json({ success: false, error: err.message });
    }
});

/**
 * Create Salary Structure
 */
router.post('/salary-structures', auth, async (req, res) => {
    try {
        const salaryStructure = new SalaryStructure({
            ...req.body,
            userId: req.user._id
        });
        await salaryStructure.save();
        res.json({ success: true, data: salaryStructure });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Get All Salary Structures
 */
router.get('/salary-structures', auth, async (req, res) => {
    try {
        const structures = await SalaryStructure.find({ userId: req.user._id });
        res.json({ success: true, data: structures });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Update Salary Structure
 */
router.patch('/salary-structures/:id', auth, async (req, res) => {
    try {
        const structure = await SalaryStructure.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            req.body,
            { new: true, runValidators: true }
        );

        if (!structure) {
            return res.status(404).json({ success: false, error: 'Salary structure not found' });
        }

        res.json({ success: true, data: structure });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Deactivate Salary Structure
 */
router.delete('/salary-structures/:id', auth, async (req, res) => {
    try {
        const structure = await SalaryStructure.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { isActive: false, effectiveTo: new Date() },
            { new: true }
        );

        if (!structure) {
            return res.status(404).json({ success: false, error: 'Salary structure not found' });
        }

        res.json({ success: true, data: structure });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Create Employee Perk
 */
router.post('/perks', auth, async (req, res) => {
    try {
        const perk = new EmployeePerk({
            ...req.body,
            userId: req.user._id
        });
        await perk.save();
        res.json({ success: true, data: perk });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Get All Perks
 */
router.get('/perks', auth, async (req, res) => {
    try {
        const { employeeId } = req.query;
        const query = { userId: req.user._id };

        if (employeeId) {
            query.employeeId = employeeId;
        }

        const perks = await EmployeePerk.find(query);
        res.json({ success: true, data: perks });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Update Perk
 */
router.patch('/perks/:id', auth, async (req, res) => {
    try {
        const perk = await EmployeePerk.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            req.body,
            { new: true, runValidators: true }
        );

        if (!perk) {
            return res.status(404).json({ success: false, error: 'Perk not found' });
        }

        res.json({ success: true, data: perk });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Get Employee YTD Statistics
 */
router.get('/ytd/:employeeId', auth, async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const ytd = await payrollService.getEmployeeYTD(
            req.user._id,
            req.params.employeeId,
            year
        );
        res.json({ success: true, data: ytd });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
