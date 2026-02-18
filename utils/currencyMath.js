/**
 * Currency Math Utility
 * Part of Issue #630: Historical Currency Revaluation Engine Overhaul
 * Provides high-precision currency calculations and standardized rounding
 */

class CurrencyMath {
    /**
     * Standardize rounding for financial amounts
     * @param {Number} amount 
     * @param {Number} decimals 
     */
    static round(amount, decimals = 2) {
        if (isNaN(amount)) return 0;
        const factor = Math.pow(10, decimals);
        return Math.round((amount + Number.EPSILON) * factor) / factor;
    }

    /**
     * Convert amount between currencies with precision
     * @param {Number} amount 
     * @param {Number} rate 
     * @param {Number} decimals 
     */
    static convert(amount, rate, decimals = 2) {
        if (!amount || !rate) return 0;
        return this.round(amount * rate, decimals);
    }

    /**
     * Calculate percentage change between two values
     * @param {Number} newValue 
     * @param {Number} oldValue 
     */
    static calculatePercentageChange(newValue, oldValue) {
        if (!oldValue || oldValue === 0) return 0;
        return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
    }

    /**
     * Calculate FX impact (Revaluation Gain/Loss)
     * @param {Number} amount Amount in original currency
     * @param {Number} oldRate 
     * @param {Number} newRate 
     */
    static calculateFxImpact(amount, oldRate, newRate) {
        const oldValue = this.convert(amount, oldRate);
        const newValue = this.convert(amount, newRate);
        return {
            impact: newValue - oldValue,
            percentage: this.calculatePercentageChange(newRate, oldRate)
        };
    }

    /**
     * Validate if an amount is valid for processing
     * @param {any} amount 
     */
    static isValidAmount(amount) {
        return typeof amount === 'number' && !isNaN(amount) && isFinite(amount);
    }

    /**
     * Format currency for display (internal utility)
     * @param {Number} amount 
     * @param {String} currency 
     * @param {String} locale 
     */
    static format(amount, currency = 'USD', locale = 'en-US') {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    /**
     * Compare two financial amounts for equality within a small epsilon
     * @param {Number} a 
     * @param {Number} b 
     * @param {Number} epsilon 
     */
    static equals(a, b, epsilon = 0.00001) {
        return Math.abs(a - b) < epsilon;
    }

    /**
     * Calculate weighted average exchange rate
     * @param {Array} lots - Array of { amount, rate }
     */
    static calculateWeightedAverageRate(lots) {
        if (!lots || lots.length === 0) return 0;

        let totalOriginalAmount = 0;
        let totalConvertedAmount = 0;

        for (const lot of lots) {
            totalOriginalAmount += lot.amount;
            totalConvertedAmount += (lot.amount * lot.rate);
        }

        if (totalOriginalAmount === 0) return 0;
        return totalConvertedAmount / totalOriginalAmount;
    }
}

module.exports = CurrencyMath;
