const SalaryStructure = require('../models/SalaryStructure');
const PayrollRun = require('../models/PayrollRun');
const EmployeePerk = require('../models/EmployeePerk');
const deductionEngine = require('./deductionEngine');

class PayrollService {
    /**
     * Generate payroll for a specific period
     */
    async generatePayroll(userId, month, year) {
        const periodStart = new Date(year, month - 1, 1);
        const periodEnd = new Date(year, month, 0);

        // Get all active salary structures
        const salaryStructures = await SalaryStructure.find({
            userId,
            isActive: true,
            effectiveFrom: { $lte: periodEnd }
        });

        if (salaryStructures.length === 0) {
            throw new Error('No active salary structures found');
        }

        // Generate payroll entries
        const entries = [];

        for (const structure of salaryStructures) {
            const entry = await this.generatePayrollEntry(structure, month, year);
            entries.push(entry);
        }

        // Create payroll run
        const runId = `PR-${year}${String(month).padStart(2, '0')}-${Date.now()}`;

        const payrollRun = new PayrollRun({
            userId,
            runId,
            payrollPeriod: { month, year },
            periodStart,
            periodEnd,
            entries,
            status: 'draft'
        });

        await payrollRun.save();
        return payrollRun;
    }

    /**
     * Generate individual payroll entry
     */
    async generatePayrollEntry(salaryStructure, month, year) {
        // Extract components
        const earnings = salaryStructure.components.filter(c => c.componentType === 'earning');
        const deductions = salaryStructure.components.filter(c => c.componentType === 'deduction');
        const reimbursements = salaryStructure.components.filter(c => c.componentType === 'reimbursement');

        // Calculate component amounts
        const calculatedEarnings = this.calculateComponents(earnings, salaryStructure);
        const calculatedDeductions = this.calculateComponents(deductions, salaryStructure);
        const calculatedReimbursements = this.calculateComponents(reimbursements, salaryStructure);

        // Calculate gross pay
        const grossPay = calculatedEarnings.reduce((sum, e) => sum + e.amount, 0);

        // Get basic and HRA for statutory calculations
        const basic = calculatedEarnings.find(e => e.componentName.toLowerCase().includes('basic'))?.amount || grossPay * 0.4;
        const hra = calculatedEarnings.find(e => e.componentName.toLowerCase().includes('hra'))?.amount || 0;
        const da = calculatedEarnings.find(e => e.componentName.toLowerCase().includes('da'))?.amount || 0;

        // Calculate statutory deductions
        const statutory = deductionEngine.calculateMonthlyDeductions({
            basic,
            hra,
            da,
            gross: grossPay
        }, salaryStructure.taxRegime);

        // Add perks taxable value
        const perks = await EmployeePerk.find({
            userId: salaryStructure.userId,
            employeeId: salaryStructure.employeeId,
            status: 'active',
            effectiveFrom: { $lte: new Date(year, month - 1, 1) }
        });

        const perksTaxableValue = perks
            .filter(p => p.isTaxable && p.frequency === 'monthly')
            .reduce((sum, p) => sum + p.taxableValue, 0);

        // Combine all deductions
        const allDeductions = [
            ...calculatedDeductions,
            { componentName: 'TDS', amount: statutory.tds },
            { componentName: 'Professional Tax', amount: statutory.professionalTax },
            { componentName: 'Provident Fund', amount: statutory.providentFund },
            { componentName: 'ESI', amount: statutory.esi }
        ];

        const totalDeductions = allDeductions.reduce((sum, d) => sum + d.amount, 0);
        const netPay = grossPay - totalDeductions;

        return {
            employeeId: salaryStructure.employeeId,
            employeeName: salaryStructure.employeeName,
            salaryStructureId: salaryStructure._id,
            earnings: calculatedEarnings,
            deductions: allDeductions,
            reimbursements: calculatedReimbursements,
            grossPay,
            totalDeductions,
            netPay,
            taxDeducted: statutory.tds,
            professionalTax: statutory.professionalTax,
            providentFund: statutory.providentFund,
            esi: statutory.esi,
            paymentStatus: 'pending'
        };
    }

    /**
     * Calculate component amounts based on calculation type
     */
    calculateComponents(components, salaryStructure) {
        return components.map(component => {
            let amount = 0;

            switch (component.calculationType) {
                case 'fixed':
                    amount = component.amount;
                    break;

                case 'percentage':
                    if (component.baseComponent) {
                        const baseComp = salaryStructure.components.find(
                            c => c.componentName === component.baseComponent
                        );
                        amount = baseComp ? (baseComp.amount * component.percentage / 100) : 0;
                    } else {
                        // Percentage of CTC
                        amount = salaryStructure.ctc * component.percentage / 100;
                    }
                    break;

                case 'formula':
                    // For complex formulas, implement custom logic
                    amount = component.amount;
                    break;
            }

            return {
                componentName: component.componentName,
                amount: Math.round(amount)
            };
        });
    }

    /**
     * Approve payroll run
     */
    async approvePayroll(payrollRunId, approverId) {
        const payrollRun = await PayrollRun.findById(payrollRunId);

        if (!payrollRun) {
            throw new Error('Payroll run not found');
        }

        if (payrollRun.status !== 'draft' && payrollRun.status !== 'pending_approval') {
            throw new Error('Payroll run cannot be approved in current status');
        }

        payrollRun.status = 'approved';
        payrollRun.approvedBy = approverId;
        payrollRun.approvedAt = new Date();

        await payrollRun.save();
        return payrollRun;
    }

    /**
     * Process payroll (mark as processing/completed)
     */
    async processPayroll(payrollRunId) {
        const payrollRun = await PayrollRun.findById(payrollRunId);

        if (!payrollRun) {
            throw new Error('Payroll run not found');
        }

        if (payrollRun.status !== 'approved') {
            throw new Error('Payroll must be approved before processing');
        }

        payrollRun.status = 'processing';
        await payrollRun.save();

        // Simulate payment processing
        // In real implementation, integrate with payment gateway

        for (const entry of payrollRun.entries) {
            entry.paymentStatus = 'processed';
            entry.paymentDate = new Date();
            entry.paymentReference = `PAY-${Date.now()}-${entry.employeeId}`;
        }

        payrollRun.status = 'completed';
        payrollRun.processedAt = new Date();
        await payrollRun.save();

        return payrollRun;
    }

    /**
     * Get payroll dashboard statistics
     */
    async getPayrollDashboard(userId) {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();

        // Get current month payroll
        const currentPayroll = await PayrollRun.findOne({
            userId,
            'payrollPeriod.month': currentMonth,
            'payrollPeriod.year': currentYear
        });

        // Get all active employees
        const activeEmployees = await SalaryStructure.find({ userId, isActive: true });

        // Get last 6 months payroll history
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const payrollHistory = await PayrollRun.find({
            userId,
            periodStart: { $gte: sixMonthsAgo }
        }).sort({ periodStart: -1 });

        // Calculate trends
        const monthlyTrends = payrollHistory.map(pr => ({
            month: pr.payrollPeriod.month,
            year: pr.payrollPeriod.year,
            totalNetPay: pr.summary.totalNetPay,
            totalTax: pr.summary.totalTax,
            employeeCount: pr.summary.totalEmployees
        }));

        return {
            currentPayroll,
            activeEmployeeCount: activeEmployees.length,
            monthlyTrends,
            pendingApprovals: await PayrollRun.countDocuments({
                userId,
                status: { $in: ['draft', 'pending_approval'] }
            })
        };
    }

    /**
     * Get employee payslip
     */
    async getPayslip(payrollRunId, employeeId) {
        const payrollRun = await PayrollRun.findById(payrollRunId);

        if (!payrollRun) {
            throw new Error('Payroll run not found');
        }

        const entry = payrollRun.entries.find(e => e.employeeId === employeeId);

        if (!entry) {
            throw new Error('Employee not found in this payroll run');
        }

        return {
            payrollPeriod: payrollRun.payrollPeriod,
            employee: {
                id: entry.employeeId,
                name: entry.employeeName
            },
            earnings: entry.earnings,
            deductions: entry.deductions,
            reimbursements: entry.reimbursements,
            grossPay: entry.grossPay,
            totalDeductions: entry.totalDeductions,
            netPay: entry.netPay,
            paymentStatus: entry.paymentStatus,
            paymentDate: entry.paymentDate,
            paymentReference: entry.paymentReference
        };
    }

    /**
     * Calculate year-to-date (YTD) statistics for an employee
     */
    async getEmployeeYTD(userId, employeeId, year) {
        const payrollRuns = await PayrollRun.find({
            userId,
            'payrollPeriod.year': year,
            status: 'completed'
        });

        let ytdGross = 0;
        let ytdDeductions = 0;
        let ytdNet = 0;
        let ytdTax = 0;

        for (const run of payrollRuns) {
            const entry = run.entries.find(e => e.employeeId === employeeId);
            if (entry) {
                ytdGross += entry.grossPay;
                ytdDeductions += entry.totalDeductions;
                ytdNet += entry.netPay;
                ytdTax += entry.taxDeducted;
            }
        }

        return {
            year,
            ytdGross,
            ytdDeductions,
            ytdNet,
            ytdTax,
            monthsProcessed: payrollRuns.length
        };
    }
}

module.exports = new PayrollService();
