/**
 * Anomaly Detection Test Suite
 * Issue #645: Verifies statistical math and risk scoring logic
 */

const assert = require('assert');
const statisticalMath = require('../utils/statisticalMath');

describe('Intelligent Anomaly Detection', () => {

    describe('Statistical Math Utilities', () => {
        const values = [10, 20, 30, 40, 50]; // Mean = 30, StdDev = ~14.14

        it('should calculate the mean correctly', () => {
            assert.strictEqual(statisticalMath.mean(values), 30);
        });

        it('should calculate standard deviation correctly', () => {
            const stdDev = statisticalMath.standardDeviation(values);
            assert(stdDev > 14 && stdDev < 15);
        });

        it('should calculate Z-score correctly', () => {
            const mean = 30;
            const stdDev = 10;
            const value = 50; // Z = (50 - 30) / 10 = 2
            assert.strictEqual(statisticalMath.zScore(value, mean, stdDev), 2);
        });

        it('should calculate moving average correctly', () => {
            const data = [10, 10, 10, 20, 20];
            const ma = statisticalMath.movingAverage(data, 3); // (10 + 20 + 20) / 3 = 16.66
            assert(ma > 16 && ma < 17);
        });
    });

    describe('Risk Logic (Conceptual)', () => {
        it('should identify extreme outliers using IQR thresholds', () => {
            const data = [10, 12, 11, 13, 15, 12, 110]; // 110 is extreme
            const thresholds = statisticalMath.getOutlierThresholds(data);
            assert(110 > thresholds.upper);
        });
    });
});
