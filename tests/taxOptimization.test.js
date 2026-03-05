const assert = require('assert');
const taxOptimizationEngine = require('../services/taxOptimizationEngine');
const taxCodeResolver = require('../utils/taxCodeResolver');
const mathCompliance = require('../utils/mathCompliance');
const taxRepository = require('../repositories/taxRepository');

describe('Autonomous Tax Optimization & Real-Time Deduction Engine (#843)', () => {

    const originalGetRule = taxRepository.getRuleForCategory;

    beforeEach(() => {
        taxRepository.getRuleForCategory = async () => null;
    });

    afterEach(() => {
        taxRepository.getRuleForCategory = originalGetRule;
    });

    it('TaxCodeResolver should map categories to regional tax codes', () => {
        const usCode = taxCodeResolver.resolveCode('Software', 'US-CA');
        const inCode = taxCodeResolver.resolveCode('Travel', 'IN-KA');

        assert.strictEqual(usCode, 'IRS-197');
        assert.strictEqual(inCode, 'GST-TRAVEL');
    });

    it('TaxOptimizationEngine should estimate deductions based on category', async () => {
        const expense = {
            amount: 1000,
            categoryName: 'Software',
            date: new Date()
        };

        const evaluation = await taxOptimizationEngine.evaluateDeduction('mock-workspace', expense, 'US-CA');

        // Since we don't have real DB records in unit test without mocks, 
        // it falls back to heuristic 50% for Software
        assert.strictEqual(evaluation.isDeductible, true);
        assert.strictEqual(evaluation.deductionEstimated, 500);
        assert.strictEqual(evaluation.taxCode, 'IRS-197');
    });

    it('TaxOptimizationEngine should suggest strategic spend accelerate action', async () => {
        const currentDeductions = 50000;
        const targetedDeductions = 100000;

        const advice = await taxOptimizationEngine.getStrategicSpendAdvice('mock-workspace', currentDeductions, targetedDeductions);

        assert.strictEqual(advice.action, 'ACCELERATE_SPEND');
        assert.ok(advice.advice.includes('Consider bringing forward'));
    });

    it('MathCompliance should calculate z-scores for audit flagging', () => {
        const historical = [100, 110, 120, 100, 110];
        const outlier = 500;

        const zScore = mathCompliance.calculateZScore(outlier, historical);
        assert.ok(zScore > 3, 'Outlier should have high Z-Score');

        const normal = 110;
        const normalZ = mathCompliance.calculateZScore(normal, historical);
        assert.ok(Math.abs(normalZ) < 1, 'Normal value should have low Z-Score');
    });
});
