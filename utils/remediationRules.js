/**
 * Remediation Rules Utility
 * Issue #704: Logic for autonomously fixing data anomalies.
 */

class RemediationRules {
    /**
     * Fix currency casing (INR instead of inr)
     */
    sanitizeCurrency(currency) {
        if (!currency) return { value: 'INR', remediated: true, action: 'default_set' };
        const upper = currency.trim().toUpperCase();
        return {
            value: upper,
            remediated: upper !== currency,
            action: 'casing_fix'
        };
    }

    /**
     * Ensure dates are not in the wild future
     */
    boundDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const maxFuture = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days future max

        if (isNaN(date.getTime())) {
            return { value: now, remediated: true, action: 'invalid_date_reset' };
        }

        if (date > maxFuture) {
            return { value: now, remediated: true, action: 'future_bound_clip' };
        }

        return { value: date, remediated: false };
    }

    /**
     * Normalize merchant names (remove trailing whitespace, etc.)
     */
    normalizeMerchant(name) {
        if (!name) return { value: 'Unknown Merchant', remediated: true, action: 'placeholder_set' };
        const clean = name.trim().replace(/\s+/g, ' ');
        return {
            value: clean,
            remediated: clean !== name,
            action: 'whitespace_cleanup'
        };
    }

    /**
     * Ensure amounts are positive (take absolute value if negative by mistake)
     */
    sanitizeAmount(amount) {
        const num = parseFloat(amount);
        if (isNaN(num)) return { value: 0.01, remediated: true, action: 'nan_reset' };
        if (num < 0) return { value: Math.abs(num), remediated: true, action: 'absolute_value_correction' };
        return { value: num, remediated: false };
    }
}

module.exports = new RemediationRules();
