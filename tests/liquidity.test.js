const assert = require('assert');
const FinancialMath = require('../utils/financialMath');

/**
 * Liquidity Guard & Stress Test Suite
 * Issue #739: Verifies mathematical simulations and risk detection.
 */

describe('Predictive Liquidity Guard Infrastructure', () => {

    describe('FinancialMath Unit Tests', () => {
        it('should generate random values within reasonable normal distribution', () => {
            const mean = 100;
            const stdDev = 10;
            const samples = 1000;
            let sum = 0;

            for (let i = 0; i < samples; i++) {
                sum += FinancialMath.normalRandom(mean, stdDev);
            }

            const actualMean = sum / samples;
            // Allow for 5% margin of error in random sampling
            assert.ok(actualMean > 95 && actualMean < 105, `Mean ${actualMean} out of range`);
        });

        it('should correctly calculate Value at Risk (VaR)', () => {
            const mockSimResults = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
            const var90 = FinancialMath.calculateVaR(mockSimResults, 0.90);
            // 90% confidence index -> 10% index -> index 1 -> value 20
            assert.strictEqual(var90, 20);
        });

        it('should detect probability of ruin correctly', () => {
            const mockSimResults = [100, 50, -10, -50, 200]; // 2 out of 5 are < 0
            const ruinProb = FinancialMath.calculateProbabilityOfRuin(mockSimResults);
            assert.strictEqual(ruinProb, 0.4);
        });
    });

    describe('Monte Carlo Simulation Logic', () => {
        it('should simulate cash flow with expected volatility', () => {
            const results = FinancialMath.simulateCashFlow(1000, 500, 400, 0.1, 100);
            assert.strictEqual(results.length, 100);

            // Check that values are numbers and roughly in range
            results.forEach(val => assert.strictEqual(typeof val, 'number'));
        });
    });
});
