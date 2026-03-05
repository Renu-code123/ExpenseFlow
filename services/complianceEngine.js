const ComplianceRule = require('../models/ComplianceRule');
const TaxCalculators = require('../utils/taxCalculators');

class ComplianceEngine {
    /**
     * Determine applicable tax for a transaction
     */
    async evaluateTransactionTax(transactionData) {
        const { jurisdiction, category, amount, isExport } = transactionData;

        // Find active rules for jurisdiction
        const rules = await ComplianceRule.find({
            jurisdiction,
            isActive: true,
            effectiveFrom: { $lte: new Date() },
            $or: [{ effectiveTo: null }, { effectiveTo: { $gte: new Date() } }]
        });

        const applicableRules = rules.filter(rule => {
            // Check category conditions
            if (rule.conditions.category.length > 0 && !rule.conditions.category.includes(category)) {
                return false;
            }
            // Check threshold
            if (rule.conditions.threshold && amount < rule.conditions.threshold) {
                return false;
            }
            // Check export status
            if (rule.conditions.isExport !== undefined && rule.conditions.isExport !== isExport) {
                return false;
            }
            return true;
        });

        const taxes = applicableRules.map(rule => {
            const calc = TaxCalculators.calculateExclusive(amount, rule.rate);
            return {
                taxType: rule.taxType,
                rate: rule.rate,
                amount: calc.tax,
                ruleId: rule._id
            };
        });

        const totalTax = taxes.reduce((sum, t) => sum + t.amount, 0);
        return {
            netAmount: amount,
            totalTax,
            grossAmount: amount + totalTax,
            breakdown: taxes
        };
    }

    /**
     * Batch validate compliance for a set of transactions
     */
    async validateBatchCompliance(transactions) {
        const results = [];
        for (const txn of transactions) {
            const evaluation = await this.evaluateTransactionTax(txn);
            const variance = Math.abs(txn.taxAmount - evaluation.totalTax);

            results.push({
                transactionId: txn._id,
                expectedTax: evaluation.totalTax,
                actualTax: txn.taxAmount,
                variance,
                isCompliant: variance < 0.01 // Floating point tolerance
            });
        }
        return results;
    }
}

module.exports = new ComplianceEngine();
