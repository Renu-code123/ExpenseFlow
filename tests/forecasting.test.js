/**
 * Forecasting & Monte Carlo Test Suite
 * Issue #678: Verifies statistical math and simulation logic
 */

const assert = require('assert');
const simulationMath = require('../utils/simulationMath');

describe('Probabilistic Forecasting Engine', () => {

    describe('Simulation Math', () => {
        it('should generate samples with a normal distribution characteristic', () => {
            const mean = 1000;
            const stdDev = 100;
            const samples = [];

            for (let i = 0; i < 5000; i++) {
                samples.push(simulationMath.sampleNormal(mean, stdDev));
            }

            const stats = simulationMath.getStats(samples);

            // Allow for 5% margin of error in stochastic testing
            assert.ok(Math.abs(stats.mean - mean) < 20, `Mean ${stats.mean} far from ${mean}`);
            assert.ok(Math.abs(stats.stdDev - stdDev) < 20, `StdDev ${stats.stdDev} far from ${stdDev}`);
        });

        it('should calculate accurate percentiles', () => {
            const samples = Array.from({ length: 101 }, (_, i) => i); // 0 to 100
            const percentiles = simulationMath.calculatePercentiles(samples, [5, 50, 95]);

            assert.strictEqual(percentiles.p5, 5);
            assert.strictEqual(percentiles.p50, 50);
            assert.strictEqual(percentiles.p95, 95);
        });
    });

    describe('Liquidity Engine Logic', () => {
        // Note: These tests require a database-connected environment with mongoose installed
        let forecastingEngine;
        try {
            forecastingEngine = require('../services/forecastingEngine');
        } catch (e) {
            // Skip if dependencies are missing in the test runner
        }

        if (forecastingEngine) {
            it('should identify risk of insolvency correctly', () => {
                const mockResults = [
                    { path: [100, 50, -10], final: -10 },
                    { path: [100, 70, 40], final: 40 },
                    { path: [100, 30, -5], final: -5 },
                    { path: [100, 110, 120], final: 120 }
                ];

                const processed = forecastingEngine._processResults(mockResults, 2);

                // 2 out of 4 results are negative (risk of insolvency = 50%)
                assert.strictEqual(processed.summary.riskOfInsolvencyPct, 50);
                assert.strictEqual(processed.summary.startBalance, 100);
            });
        }
    });
});
