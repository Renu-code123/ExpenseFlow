/**
 * Deduction Engine
 * Calculates statutory deductions including TDS, Professional Tax, PF, ESI
 */

class DeductionEngine {
    /**
     * Calculate Income Tax (TDS) based on tax regime and salary
     */
    calculateIncomeTax(annualIncome, taxRegime = 'new', deductions = {}) {
        if (taxRegime === 'new') {
            return this.calculateNewRegimeTax(annualIncome);
        } else {
            return this.calculateOldRegimeTax(annualIncome, deductions);
        }
    }

    /**
     * New Tax Regime (FY 2023-24 onwards)
     */
    calculateNewRegimeTax(annualIncome) {
        let tax = 0;

        // Tax slabs for new regime
        const slabs = [
            { limit: 300000, rate: 0 },
            { limit: 600000, rate: 0.05 },
            { limit: 900000, rate: 0.10 },
            { limit: 1200000, rate: 0.15 },
            { limit: 1500000, rate: 0.20 },
            { limit: Infinity, rate: 0.30 }
        ];

        let previousLimit = 0;
        for (const slab of slabs) {
            if (annualIncome > previousLimit) {
                const taxableInSlab = Math.min(annualIncome, slab.limit) - previousLimit;
                tax += taxableInSlab * slab.rate;
                previousLimit = slab.limit;
            } else {
                break;
            }
        }

        // Add cess (4% of tax)
        tax += tax * 0.04;

        // Rebate under section 87A (if income <= 7 lakhs)
        if (annualIncome <= 700000) {
            tax = Math.max(0, tax - 25000);
        }

        return Math.round(tax);
    }

    /**
     * Old Tax Regime with deductions
     */
    calculateOldRegimeTax(annualIncome, deductions = {}) {
        // Standard deduction
        const standardDeduction = 50000;

        // Section 80C (max 150000)
        const section80C = Math.min(deductions.section80C || 0, 150000);

        // Section 80D (Health insurance - max 25000 for self, 50000 if senior citizen)
        const section80D = Math.min(deductions.section80D || 0, 25000);

        // HRA exemption
        const hraExemption = deductions.hraExemption || 0;

        // Calculate taxable income
        let taxableIncome = annualIncome - standardDeduction - section80C - section80D - hraExemption;
        taxableIncome = Math.max(0, taxableIncome);

        let tax = 0;

        // Tax slabs for old regime
        const slabs = [
            { limit: 250000, rate: 0 },
            { limit: 500000, rate: 0.05 },
            { limit: 1000000, rate: 0.20 },
            { limit: Infinity, rate: 0.30 }
        ];

        let previousLimit = 0;
        for (const slab of slabs) {
            if (taxableIncome > previousLimit) {
                const taxableInSlab = Math.min(taxableIncome, slab.limit) - previousLimit;
                tax += taxableInSlab * slab.rate;
                previousLimit = slab.limit;
            } else {
                break;
            }
        }

        // Add cess (4% of tax)
        tax += tax * 0.04;

        // Rebate under section 87A (if taxable income <= 5 lakhs)
        if (taxableIncome <= 500000) {
            tax = Math.max(0, tax - 12500);
        }

        return Math.round(tax);
    }

    /**
     * Calculate Professional Tax (State-specific)
     * Using Maharashtra rates as example
     */
    calculateProfessionalTax(monthlySalary, state = 'Maharashtra') {
        const stateTaxRates = {
            'Maharashtra': [
                { limit: 7500, tax: 0 },
                { limit: 10000, tax: 175 },
                { limit: Infinity, tax: 200 }
            ],
            'Karnataka': [
                { limit: 15000, tax: 0 },
                { limit: Infinity, tax: 200 }
            ],
            'West Bengal': [
                { limit: 10000, tax: 0 },
                { limit: 15000, tax: 110 },
                { limit: 25000, tax: 130 },
                { limit: 40000, tax: 150 },
                { limit: Infinity, tax: 200 }
            ]
        };

        const rates = stateTaxRates[state] || stateTaxRates['Maharashtra'];

        for (const bracket of rates) {
            if (monthlySalary <= bracket.limit) {
                return bracket.tax;
            }
        }

        return 0;
    }

    /**
     * Calculate Provident Fund (PF)
     * Employee contribution: 12% of Basic + DA
     * Employer contribution: 12% of Basic + DA (3.67% to EPF, 8.33% to EPS)
     */
    calculateProvidentFund(basicSalary, daAllowance = 0) {
        const pfBase = basicSalary + daAllowance;
        const pfWageLimit = 15000; // PF wage ceiling

        const contributoryWage = Math.min(pfBase, pfWageLimit);
        const employeeContribution = Math.round(contributoryWage * 0.12);
        const employerContribution = Math.round(contributoryWage * 0.12);

        return {
            employeeContribution,
            employerContribution,
            totalContribution: employeeContribution + employerContribution,
            contributoryWage
        };
    }

    /**
     * Calculate Employee State Insurance (ESI)
     * Applicable if gross salary <= 21,000 per month
     * Employee: 0.75%, Employer: 3.25%
     */
    calculateESI(grossSalary) {
        const esiLimit = 21000;

        if (grossSalary > esiLimit) {
            return {
                employeeContribution: 0,
                employerContribution: 0,
                totalContribution: 0,
                isApplicable: false
            };
        }

        const employeeContribution = Math.round(grossSalary * 0.0075);
        const employerContribution = Math.round(grossSalary * 0.0325);

        return {
            employeeContribution,
            employerContribution,
            totalContribution: employeeContribution + employerContribution,
            isApplicable: true
        };
    }

    /**
     * Calculate HRA exemption (for old tax regime)
     */
    calculateHRAExemption(basicSalary, hraReceived, rentPaid, isMetro = false) {
        // HRA exemption is minimum of:
        // 1. Actual HRA received
        // 2. 50% of basic (metro) or 40% of basic (non-metro)
        // 3. Rent paid - 10% of basic

        const metroPercentage = isMetro ? 0.50 : 0.40;

        const option1 = hraReceived;
        const option2 = basicSalary * metroPercentage;
        const option3 = Math.max(0, rentPaid - (basicSalary * 0.10));

        const exemption = Math.min(option1, option2, option3);

        return Math.max(0, exemption);
    }

    /**
     * Calculate LTA (Leave Travel Allowance) exemption
     */
    calculateLTAExemption(ltaReceived, actualTravelExpense) {
        // LTA exemption is minimum of actual LTA received and actual travel expense
        // Limited to 2 journeys in a block of 4 years
        return Math.min(ltaReceived, actualTravelExpense);
    }

    /**
     * Calculate total monthly deductions for an employee
     */
    calculateMonthlyDeductions(salaryComponents, taxRegime = 'new', state = 'Maharashtra') {
        const basic = salaryComponents.basic || 0;
        const hra = salaryComponents.hra || 0;
        const da = salaryComponents.da || 0;
        const grossSalary = salaryComponents.gross || 0;
        const annualIncome = grossSalary * 12;

        // Calculate annual tax
        const annualTax = this.calculateIncomeTax(annualIncome, taxRegime);
        const monthlyTDS = Math.round(annualTax / 12);

        // Professional Tax
        const professionalTax = this.calculateProfessionalTax(grossSalary, state);

        // PF
        const pf = this.calculateProvidentFund(basic, da);

        // ESI
        const esi = this.calculateESI(grossSalary);

        return {
            tds: monthlyTDS,
            professionalTax,
            providentFund: pf.employeeContribution,
            esi: esi.employeeContribution,
            totalDeductions: monthlyTDS + professionalTax + pf.employeeContribution + esi.employeeContribution,
            breakdown: {
                annualTax,
                pf,
                esi
            }
        };
    }

    /**
     * Calculate take-home salary
     */
    calculateTakeHome(grossSalary, deductions) {
        const totalDeductions = deductions.tds +
            deductions.professionalTax +
            deductions.providentFund +
            deductions.esi;

        return grossSalary - totalDeductions;
    }
}

module.exports = new DeductionEngine();
