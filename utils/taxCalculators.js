/**
 * Advanced Tax Calculators Utility
 */

const TaxCalculators = {
    /**
     * Calculate Inclusive Tax
     * Total = Net + (Net * Rate) => Net = Total / (1 + Rate)
     */
    calculateInclusive: (total, ratePercentage) => {
        const rate = ratePercentage / 100;
        const net = total / (1 + rate);
        const tax = total - net;
        return { net, tax, total };
    },

    /**
     * Calculate Exclusive Tax
     */
    calculateExclusive: (net, ratePercentage) => {
        const rate = ratePercentage / 100;
        const tax = net * rate;
        const total = net + tax;
        return { net, tax, total };
    },

    /**
     * TDS/Withholding calculation
     */
    calculateWithholding: (amount, ratePercentage) => {
        const rate = ratePercentage / 100;
        const withholding = amount * rate;
        const netPayable = amount - withholding;
        return { amount, withholding, netPayable };
    },

    /**
     * Compound Tax (Tax on Tax)
     */
    calculateCompound: (amount, rates = []) => {
        let currentTotal = amount;
        const details = rates.map(rate => {
            const tax = currentTotal * (rate / 100);
            currentTotal += tax;
            return { rate, tax };
        });
        return { initial: amount, details, final: currentTotal };
    }
};

module.exports = TaxCalculators;
