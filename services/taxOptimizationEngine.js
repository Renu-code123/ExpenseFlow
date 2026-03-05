const taxRepository = require('../repositories/taxRepository');
const taxCodeResolver = require('../utils/taxCodeResolver');
const logger = require('../utils/structuredLogger');

/**
 * Tax Optimization Engine
 * Issue #843: Predictive logic for deduction maximization and liability forecasting.
 */
class TaxOptimizationEngine {
    /**
     * Analyzes an expense to determine its tax deductibility and standard mapping.
     */
    async evaluateDeduction(workspaceId, expenseData, region = 'US-CA') {
        const year = new Date(expenseData.date || Date.now()).getFullYear();
        const category = expenseData.categoryName || 'General';

        const rule = await taxRepository.getRuleForCategory(region, year, category);

        let deductionEstimated = 0;
        let isDeductible = false;
        let taxCode = taxCodeResolver.resolveCode(category, region);

        if (rule) {
            isDeductible = rule.isDeductible;
            deductionEstimated = expenseData.amount * rule.deductionRate;
        } else {
            // Heuristic fallback if no explicit rule is found
            if (['Software', 'Office Supplies'].includes(category)) {
                isDeductible = true;
                deductionEstimated = expenseData.amount * 0.5; // Conservative 50%
            }
        }

        return {
            isDeductible,
            deductionEstimated,
            taxCode,
            confidence: rule ? 0.95 : 0.60
        };
    }

    /**
     * Suggests "strategic spend" windows to optimize tax posture.
     */
    async getStrategicSpendAdvice(workspaceId, currentDeductions, targetedDeductions) {
        const remaining = targetedDeductions - currentDeductions;
        if (remaining <= 0) return { action: 'NONE', advice: 'Current tax posture is optimized.' };

        return {
            action: 'ACCELERATE_SPEND',
            advice: `You have ${remaining.toFixed(2)} in potential deductions left. Consider bringing forward Q1 office or software renewals into the current tax year.`,
            potentialTaxSaving: remaining * 0.21 // Assuming 21% corp tax
        };
    }
}

module.exports = new TaxOptimizationEngine();
