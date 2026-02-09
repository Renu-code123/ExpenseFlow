/**
 * Debt Service
 * Issue #520: Comprehensive Debt Management & Amortization Engine
 * Complex interest calculations, payment projections, and strategy simulations
 */

const DebtAccount = require('../models/DebtAccount');
const AmortizationSchedule = require('../models/AmortizationSchedule');

class DebtService {
    /**
     * Create a new debt account
     */
    async createDebt(userId, debtData) {
        // Calculate remaining months if not provided
        if (!debtData.remainingMonths) {
            debtData.remainingMonths = debtData.termMonths;
        }

        // Calculate expected payoff date
        if (!debtData.expectedPayoffDate && debtData.firstPaymentDate) {
            const payoffDate = new Date(debtData.firstPaymentDate);
            payoffDate.setMonth(payoffDate.getMonth() + debtData.termMonths);
            debtData.expectedPayoffDate = payoffDate;
        }

        const debt = new DebtAccount({
            userId,
            ...debtData
        });

        await debt.save();

        // Generate initial amortization schedule
        await this.generateAmortizationSchedule(debt._id, 0, 'standard');

        return debt;
    }

    /**
     * Generate amortization schedule for a debt
     */
    async generateAmortizationSchedule(debtId, extraPayment = 0, scheduleType = 'standard') {
        const debt = await DebtAccount.findById(debtId);
        if (!debt) {
            throw new Error('Debt account not found');
        }

        const scheduleData = await AmortizationSchedule.generateSchedule(debt, extraPayment, scheduleType);

        // Calculate savings if extra payment
        if (extraPayment > 0) {
            const standardSchedule = await AmortizationSchedule.findOne({
                debtAccountId: debtId,
                scheduleType: 'standard'
            });

            if (standardSchedule) {
                scheduleData.interestSaved = standardSchedule.totalInterest - scheduleData.totalInterest;
                scheduleData.monthsSaved = standardSchedule.payments.length - scheduleData.payments.length;
            }
        }

        // Remove old schedule of same type
        await AmortizationSchedule.deleteMany({
            debtAccountId: debtId,
            scheduleType
        });

        const schedule = new AmortizationSchedule(scheduleData);
        await schedule.save();

        return schedule;
    }

    /**
     * Calculate monthly payment using amortization formula
     */
    calculateMonthlyPayment(principal, annualRate, termMonths) {
        const monthlyRate = annualRate / 100 / 12;

        if (monthlyRate === 0) {
            return principal / termMonths;
        }

        const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
            (Math.pow(1 + monthlyRate, termMonths) - 1);

        return parseFloat(payment.toFixed(2));
    }

    /**
     * Calculate total interest over loan term
     */
    calculateTotalInterest(principal, monthlyPayment, termMonths) {
        return (monthlyPayment * termMonths) - principal;
    }

    /**
     * Compare debt repayment strategies
     */
    async compareStrategies(userId, extraMonthlyAmount = 0) {
        const debts = await DebtAccount.find({ userId, status: 'active' });

        if (debts.length === 0) {
            return {
                message: 'No active debts found',
                strategies: []
            };
        }

        const strategies = {};

        // Strategy 1: Standard (no extra payments)
        strategies.standard = await this._simulateStrategy(debts, 'standard', 0);

        // Strategy 2: Snowball (smallest balance first)
        strategies.snowball = await this._simulateStrategy(
            debts.sort((a, b) => a.currentBalance - b.currentBalance),
            'snowball',
            extraMonthlyAmount
        );

        // Strategy 3: Avalanche (highest interest first)
        strategies.avalanche = await this._simulateStrategy(
            debts.sort((a, b) => b.interestRate - a.interestRate),
            'avalanche',
            extraMonthlyAmount
        );

        // Find best strategy
        const bestStrategy = Object.keys(strategies).reduce((best, current) => {
            return strategies[current].totalInterest < strategies[best].totalInterest ? current : best;
        });

        return {
            strategies,
            bestStrategy,
            extraMonthlyAmount,
            debtCount: debts.length,
            totalDebt: debts.reduce((sum, d) => sum + d.currentBalance, 0)
        };
    }

    /**
     * Simulate a repayment strategy
     */
    async _simulateStrategy(debts, strategyName, extraAmount) {
        let totalInterest = 0;
        let totalMonths = 0;
        let totalPayments = 0;
        const debtProgress = [];

        // Clone debts to avoid mutation
        const debtsCopy = debts.map(d => ({
            id: d._id,
            name: d.name,
            balance: d.currentBalance,
            monthlyPayment: d.monthlyPayment,
            interestRate: d.interestRate
        }));

        let month = 0;
        let remainingExtra = extraAmount;

        while (debtsCopy.some(d => d.balance > 0) && month < 600) {
            month++;

            for (let debt of debtsCopy) {
                if (debt.balance <= 0) continue;

                const monthlyRate = debt.interestRate / 100 / 12;
                const interestCharge = debt.balance * monthlyRate;

                // Determine payment amount
                let payment = debt.monthlyPayment;

                // Apply extra payment to first unpaid debt (strategy dependent)
                if (remainingExtra > 0 && debt === debtsCopy.find(d => d.balance > 0)) {
                    payment += remainingExtra;
                }

                const principalPayment = Math.min(payment - interestCharge, debt.balance);

                debt.balance -= principalPayment;
                totalInterest += interestCharge;
                totalPayments += (interestCharge + principalPayment);

                if (debt.balance <= 0) {
                    debt.balance = 0;
                    debtProgress.push({
                        debtId: debt.id,
                        debtName: debt.name,
                        paidOffMonth: month
                    });
                }
            }
        }

        totalMonths = month;

        return {
            strategyName,
            totalInterest,
            totalMonths,
            totalPayments,
            debtProgress,
            averageMonthsPerDebt: totalMonths / debts.length
        };
    }

    /**
     * Get debt-to-income ratio
     */
    async calculateDebtToIncome(userId, monthlyIncome) {
        const totalDebt = await DebtAccount.getTotalDebt(userId, true);

        if (monthlyIncome === 0) {
            return {
                ratio: 0,
                totalMonthlyPayment: totalDebt.totalMonthlyPayment,
                monthlyIncome: 0,
                status: 'unknown'
            };
        }

        const ratio = (totalDebt.totalMonthlyPayment / monthlyIncome) * 100;

        let status = 'excellent';
        if (ratio > 43) status = 'high_risk';
        else if (ratio > 36) status = 'concerning';
        else if (ratio > 28) status = 'moderate';

        return {
            ratio,
            totalMonthlyPayment: totalDebt.totalMonthlyPayment,
            monthlyIncome,
            status,
            recommendation: this._getDTIRecommendation(status)
        };
    }

    /**
     * Get DTI recommendation
     */
    _getDTIRecommendation(status) {
        const recommendations = {
            'excellent': 'Your debt-to-income ratio is healthy. Continue maintaining good financial habits.',
            'moderate': 'Your DTI is acceptable but could be improved. Consider paying down high-interest debts.',
            'concerning': 'Your DTI is high. Focus on reducing debt and avoid taking on new obligations.',
            'high_risk': 'Your DTI indicates financial stress. Seek debt consolidation or financial counseling.'
        };

        return recommendations[status] || recommendations.excellent;
    }

    /**
     * Calculate payoff acceleration with extra payments
     */
    async calculatePayoffAcceleration(debtId, extraMonthlyPayment) {
        const debt = await DebtAccount.findById(debtId);
        if (!debt) {
            throw new Error('Debt not found');
        }

        // Standard schedule
        const standardPayoff = debt.calculatePayoffDate(0);

        // Accelerated schedule
        const acceleratedPayoff = debt.calculatePayoffDate(extraMonthlyPayment);

        const monthsSaved = standardPayoff.months - acceleratedPayoff.months;
        const interestSaved = standardPayoff.totalInterest - acceleratedPayoff.totalInterest;
        const totalExtraPayments = extraMonthlyPayment * acceleratedPayoff.months;

        return {
            debtId: debt._id,
            debtName: debt.name,
            currentBalance: debt.currentBalance,
            extraMonthlyPayment,
            standard: {
                months: standardPayoff.months,
                payoffDate: standardPayoff.payoffDate,
                totalInterest: standardPayoff.totalInterest
            },
            accelerated: {
                months: acceleratedPayoff.months,
                payoffDate: acceleratedPayoff.payoffDate,
                totalInterest: acceleratedPayoff.totalInterest
            },
            savings: {
                monthsSaved,
                interestSaved,
                totalExtraPayments,
                netSavings: interestSaved - totalExtraPayments,
                roi: totalExtraPayments > 0 ? (interestSaved / totalExtraPayments) * 100 : 0
            }
        };
    }

    /**
     * Record a debt payment
     */
    async recordPayment(debtId, paymentAmount, paymentDate = new Date()) {
        const debt = await DebtAccount.findById(debtId);
        if (!debt) {
            throw new Error('Debt not found');
        }

        if (debt.status !== 'active') {
            throw new Error('Cannot record payment for inactive debt');
        }

        const paymentResult = debt.applyPayment(paymentAmount);

        // Update remaining months
        if (debt.currentBalance > 0) {
            const payoffCalc = debt.calculatePayoffDate(0);
            debt.remainingMonths = payoffCalc.months;
        } else {
            debt.remainingMonths = 0;
        }

        await debt.save();

        return {
            debtId: debt._id,
            paymentDate,
            ...paymentResult,
            remainingMonths: debt.remainingMonths,
            status: debt.status
        };
    }

    /**
     * Get debt summary for dashboard
     */
    async getDashboardSummary(userId) {
        const totalDebt = await DebtAccount.getTotalDebt(userId, true);
        const allDebts = await DebtAccount.find({ userId, status: 'active' });

        // Calculate weighted average interest rate
        const weightedRate = allDebts.reduce((sum, d) => {
            return sum + (d.interestRate * d.currentBalance);
        }, 0) / (totalDebt.totalBalance || 1);

        // Find highest interest debt
        const highestInterestDebt = allDebts.reduce((max, d) =>
            d.interestRate > (max?.interestRate || 0) ? d : max
            , null);

        // Find largest debt
        const largestDebt = allDebts.reduce((max, d) =>
            d.currentBalance > (max?.currentBalance || 0) ? d : max
            , null);

        // Calculate total progress
        const totalOriginal = allDebts.reduce((sum, d) => sum + d.originalPrincipal, 0);
        const totalPaid = totalOriginal - totalDebt.totalBalance;
        const overallProgress = totalOriginal > 0 ? (totalPaid / totalOriginal) * 100 : 0;

        return {
            totalBalance: totalDebt.totalBalance,
            totalMonthlyPayment: totalDebt.totalMonthlyPayment,
            debtCount: totalDebt.count,
            weightedAverageRate: weightedRate,
            overallProgress,
            totalPaidOff: totalPaid,
            highestInterestDebt: highestInterestDebt ? {
                id: highestInterestDebt._id,
                name: highestInterestDebt.name,
                rate: highestInterestDebt.interestRate,
                balance: highestInterestDebt.currentBalance
            } : null,
            largestDebt: largestDebt ? {
                id: largestDebt._id,
                name: largestDebt.name,
                balance: largestDebt.currentBalance
            } : null,
            debts: totalDebt.debts
        };
    }

    /**
     * Get refinancing analysis
     */
    async analyzeRefinancing(debtId, newInterestRate, newTermMonths = null) {
        const debt = await DebtAccount.findById(debtId);
        if (!debt) {
            throw new Error('Debt not found');
        }

        const currentSchedule = await AmortizationSchedule.findOne({
            debtAccountId: debtId,
            scheduleType: 'standard'
        });

        const term = newTermMonths || debt.remainingMonths;
        const newPayment = this.calculateMonthlyPayment(debt.currentBalance, newInterestRate, term);
        const newTotalInterest = this.calculateTotalInterest(debt.currentBalance, newPayment, term);

        const currentTotalInterest = currentSchedule ? currentSchedule.totalInterest :
            this.calculateTotalInterest(debt.currentBalance, debt.monthlyPayment, debt.remainingMonths);

        const interestSavings = currentTotalInterest - newTotalInterest;
        const paymentDifference = debt.monthlyPayment - newPayment;

        return {
            currentLoan: {
                balance: debt.currentBalance,
                interestRate: debt.interestRate,
                monthlyPayment: debt.monthlyPayment,
                remainingMonths: debt.remainingMonths,
                totalInterest: currentTotalInterest
            },
            refinancedLoan: {
                balance: debt.currentBalance,
                interestRate: newInterestRate,
                monthlyPayment: newPayment,
                termMonths: term,
                totalInterest: newTotalInterest
            },
            analysis: {
                interestSavings,
                paymentDifference,
                percentageSaved: currentTotalInterest > 0 ? (interestSavings / currentTotalInterest) * 100 : 0,
                recommendation: interestSavings > 0 ?
                    'Refinancing could save you money' :
                    'Current loan terms are better'
            }
        };
    }
}

module.exports = new DebtService();
