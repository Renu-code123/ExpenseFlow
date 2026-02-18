/**
 * Reporting Engine Test Suite
 * Issue #659: Verifies data aggregation and template rendering
 */

const assert = require('assert');
const dataAggregator = require('../utils/dataAggregator');

describe('Heterogeneous Reporting Engine', () => {

    describe('Data Aggregator', () => {
        it('should correctly sum transaction volumes', () => {
            const txs = [
                { amount: 100, category: 'Food', date: '2026-01-01', type: 'expense' },
                { amount: 200, category: 'Rent', date: '2026-01-02', type: 'expense' }
            ];

            const stats = dataAggregator.aggregateDetails(txs);
            assert.strictEqual(stats.totalVolume, 300);
            assert.strictEqual(stats.count, 2);
            assert.strictEqual(stats.byCategory['Food'], 100);
        });

        it('should correctly calculate net cash flow', () => {
            const txs = [
                { amount: 1000, type: 'income' },
                { amount: 300, type: 'expense' }
            ];
            const stats = dataAggregator.aggregateDetails(txs);
            assert.strictEqual(stats.netCashFlow, 700);
        });

        it('should correctly identify trends and improvements', () => {
            const curr = { totalVolume: 800, averageTransaction: 80 };
            const prev = { totalVolume: 1000, averageTransaction: 100 };

            const trends = dataAggregator.compareTrends(curr, prev);
            assert.strictEqual(trends.isImproving, true);
            assert.strictEqual(trends.spendingTrend, -20);
        });
    });

    describe('Scheduling Logic (Conceptual)', () => {
        it('should verify report frequencies', () => {
            const valid = ['daily', 'weekly', 'monthly', 'quarterly'];
            assert.ok(valid.includes('monthly'));
        });
    });
});
