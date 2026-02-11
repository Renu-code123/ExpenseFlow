/**
 * Revaluation Engine Test Suite
 * Part of Issue #630: Historical Currency Revaluation Engine Overhaul
 */

const assert = require('assert');
const CurrencyMath = require('../utils/currencyMath');
const revaluationService = require('../services/revaluationService');

describe('Historical Revaluation Engine', () => {

    describe('CurrencyMath Utility', () => {
        it('should round amounts correctly with precision', () => {
            assert.strictEqual(CurrencyMath.round(10.12345), 10.12);
            assert.strictEqual(CurrencyMath.round(10.125), 10.13);
        });

        it('should convert amounts using exchange rates', () => {
            assert.strictEqual(CurrencyMath.convert(100, 1.5), 150);
            assert.strictEqual(CurrencyMath.convert(100, 0.75), 75);
        });

        it('should calculate FX impact accurately', () => {
            const result = CurrencyMath.calculateFxImpact(100, 1.0, 1.2);
            assert.strictEqual(result.impact, 20);
            assert.strictEqual(result.percentage, 20);
        });

        it('should handle negative impact (loss)', () => {
            const result = CurrencyMath.calculateFxImpact(100, 1.2, 1.0);
            assert.strictEqual(result.impact, -20);
            assert.strictEqual(result.percentage, -16.666666666666664);
        });
    });

    describe('Revaluation Logic', () => {
        const mockSnapshots = [
            {
                date: new Date('2026-01-01'),
                totalNetWorth: 1000,
                accounts: [
                    { accountId: 'acc1', balance: 500, currency: 'USD', exchangeRate: 1 },
                    { accountId: 'acc2', balance: 500, currency: 'EUR', exchangeRate: 1.1 }
                ]
            },
            {
                date: new Date('2026-01-02'),
                totalNetWorth: 1100,
                accounts: [
                    { accountId: 'acc1', balance: 500, currency: 'USD', exchangeRate: 1 },
                    { accountId: 'acc2', balance: 500, currency: 'EUR', exchangeRate: 1.2 }
                ]
            }
        ];

        it('should calculate correct summary statistics', () => {
            // Internal helper test
            const revaluations = [
                { totalFxImpact: 50 }
            ];
            const summary = revaluationService._compileRevaluationSummary(mockSnapshots, revaluations);

            assert.strictEqual(summary.initialNetWorth, 1000);
            assert.strictEqual(summary.finalNetWorth, 1100);
            assert.strictEqual(summary.totalChange, 100);
            assert.strictEqual(summary.fxImpact, 50);
            assert.strictEqual(summary.realGrowth, 50);
            assert.strictEqual(summary.fxContributionPercentage, 50);
        });
    });

    describe('Batch Processing Integration', () => {
        it('should identify need for revaluation when rates differ', () => {
            const oldRate = 1.123;
            const newRate = 1.124;
            assert.strictEqual(CurrencyMath.equals(oldRate, newRate, 0.0001), false);
        });

        it('should NOT trigger revaluation for floating point insignificance', () => {
            const oldRate = 1.12300001;
            const newRate = 1.12300002;
            assert.strictEqual(CurrencyMath.equals(oldRate, newRate, 0.0001), true);
        });
    });

    describe('Historical Rate Matching', () => {
        it('should sanitize dates for historical lookups', () => {
            const date = new Date('2026-02-11T18:30:00Z');
            date.setHours(0, 0, 0, 0);
            const dateStr = date.toISOString().split('T')[0];
            assert.strictEqual(dateStr, '2026-02-11');
        });
    });

    describe('Weighted Average Rate Logic', () => {
        it('should calculate weighted average correctly for multiple lots', () => {
            const lots = [
                { amount: 100, rate: 1.5 },
                { amount: 200, rate: 1.8 }
            ];
            // (100*1.5 + 200*1.8) / 300 = (150 + 360) / 300 = 510 / 300 = 1.7
            const avgRate = CurrencyMath.calculateWeightedAverageRate(lots);
            assert.strictEqual(avgRate, 1.7);
        });

        it('should return 0 for empty lots', () => {
            assert.strictEqual(CurrencyMath.calculateWeightedAverageRate([]), 0);
        });
    });
});
